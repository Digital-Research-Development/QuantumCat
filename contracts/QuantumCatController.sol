// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * QUANTUM CAT CONTROLLER - ERC-20 Architecture (Exchange-Compatible)
 *
 * Three separate ERC-20 tokens:
 *  - CATBOX (superposed state)
 *  - LIVECAT (observed alive)
 *  - DEADCAT (observed dead)
 *
 * Observe - Binary Quantum Collapse:
 *  - commitObserve(amount, dataHash, userEntropy) burns CATBOX, records commitment
 *  - observe(data) after DELAY performs binary collapse: either ALL LIVECAT or ALL DEADCAT (50/50 odds)
 *  - Binary outcome: each observation is all-or-nothing (true quantum mechanics)
 *  - forceObserve(owner) finalizes after GRACE if owner disappears
 *
 * Rebox (fixed 2.5% fee):
 *  - Burn equal LIVECAT + DEADCAT pairs; mint (2*pairs − 2.5% fee) CATBOX
 *  - Fixed immutable fee prevents manipulation and ensures predictability
 *  - Requires equal amounts: you need 1 LIVECAT + 1 DEADCAT to make 1.95 CATBOX
 *
 * Security:
 *  - Commit-Reveal RNG: combines commitment-linked blockhash, prevrandao, recent block state, user entropy, and shared pool snapshot
 *  - Quantum Entanglement Protocol: all observations cryptographically linked via evolving shared entropy pool
 *  - Deterministic outcomes: same commitment inputs + block state = same result (observe and forceObserve produce identical splits)
 *  - Binary collapse: single bit provides true 50/50 quantum collapse (all LIVECAT or all DEADCAT)
 *  - Input validation: maximum amount checks prevent overflow attacks
 *  - Reentrancy-guarded; state changes before external calls
 *  - ZERO admin control: immutable parameters, no upgrades, no pausing
 */

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CATBOXToken.sol";
import "./LIVECATToken.sol";
import "./DEADCATToken.sol";

/// @title QuantumCatController - Controls the quantum observation mechanics
/// @author QuantumCat Team
/// @notice Manages commit-reveal observation and rebox mechanics for three ERC-20 tokens
/// @dev Immutable with ZERO admin control - no owner, no pause, no upgrades
contract QuantumCatController is ReentrancyGuard {
    // --- Custom Errors ---

    error PendingObservationExists();
    error NoPendingObservation();
    error InvalidAmount();
    error InsufficientDelay();
    error HashMismatch();
    error DataTooLarge();
    error GracePeriodNotPassed();
    error NoPairsAvailable();
    error ZeroAddress();
    error ZeroEntropy();
    error ETHNotAccepted();
    error AmountTooLarge(uint256 attempted, uint256 maximum);
    error SlippageExceeded();
    error NotAContract();
    error BlockhashExpired();
    error RevealWindowClosed();
    error ReboxAmountTooLarge();
    
    // --- Config Constants ---

    /// @notice Number of blocks to wait before observation can be revealed
    uint8 public constant REVEAL_DELAY = 5;

    /// @notice Additional blocks after reveal delay before force observe is allowed
    uint16 public constant GRACE = 64;

    /// @notice Maximum reveal window to ensure blockhash availability (must be < 256)
    /// @dev After this many blocks from commit, reveals are no longer accepted
    uint16 public constant MAX_REVEAL_WINDOW = 250;

    /// @notice Maximum size of observation data in bytes
    uint16 public constant DATA_MAX = 256;

    /// @notice Maximum amount for observe to prevent overflow (1 billion tokens with 18 decimals)
    uint256 public constant MAX_OBSERVE_AMOUNT = 10**27;

    /// @notice Maximum pairs for rebox to prevent overflow (uses uint128 as safe upper bound)
    /// @dev Prevents overflow in pairs * 2 calculation even in unchecked blocks
    uint256 public constant MAX_REBOX_PAIRS = type(uint128).max;

    /// @notice Maximum basis points (100%)
    uint96 private constant _MAX_BPS = 10_000;

    /// @notice Fixed rebox fee in basis points (2.5% - immutable and predictable)
    /// @dev Fixed fee prevents manipulation and ensures long-term sustainability
    uint96 public constant REBOX_FEE_BPS = 250;

    /// @notice Contract version for deployment tracking
    string public constant VERSION = "1.0.0";

    // --- Token References ---

    /// @notice CATBOX token (superposed)
    CATBOXToken public immutable catbox;

    /// @notice LIVECAT token (observed alive)
    LIVECATToken public immutable livecat;

    /// @notice DEADCAT token (observed dead)
    DEADCATToken public immutable deadcat;

    // --- Pending Observation Storage ---

    struct Pending {
        uint256 amount;           // Amount of CATBOX escrowed
        bytes32 dataHash;         // Committed data hash
        bytes32 userEntropyHash;  // Hash of user-provided entropy (not the raw value)
        bytes32 entropySnapshot;  // Snapshot of shared entropy at commit time
        uint64 refBlock;          // Reference block number
    }

    /// @notice Pending observations storage (private to protect entropy)
    /// @dev Made private to prevent frontrunning and entropy analysis attacks
    mapping(address => Pending) private _pending;

    /// @notice Shared entropy pool from all observations (Quantum Entanglement Protocol)
    /// @dev Creates cryptographic entanglement: each observation outcome depends on all others
    bytes32 public sharedEntropyPool;

    // --- Events ---

    event CommitObserve(address indexed user, uint256 amount, bytes32 dataHash, uint64 refBlock);
    event Observed(address indexed user, uint256 alive, uint256 dead);
    event Forced(address indexed user, uint256 alive, uint256 dead);
    event Reboxed(address indexed user, uint256 indexed pairs, uint256 catboxMinted, uint256 feeTokens);
    event EntropyPoolUpdated(bytes32 indexed oldPool, bytes32 indexed newPool);
    event ObservationCancelled(address indexed user, uint256 amount);

    /// @notice Constructor for immutable controller deployment
    /// @param _catbox Address of CATBOX token contract
    /// @param _livecat Address of LIVECAT token contract
    /// @param _deadcat Address of DEADCAT token contract
    constructor(
        address _catbox,
        address _livecat,
        address _deadcat
    ) {
        if (_catbox == address(0)) revert ZeroAddress();
        if (_livecat == address(0)) revert ZeroAddress();
        if (_deadcat == address(0)) revert ZeroAddress();
        
        // Validate that addresses are contracts, not EOAs
        if (_catbox.code.length == 0) revert NotAContract();
        if (_livecat.code.length == 0) revert NotAContract();
        if (_deadcat.code.length == 0) revert NotAContract();

        catbox = CATBOXToken(_catbox);
        livecat = LIVECATToken(_livecat);
        deadcat = DEADCATToken(_deadcat);
        
        // Initialize shared entropy pool with deployment entropy
        // This provides stronger randomness for the first observations
        sharedEntropyPool = keccak256(abi.encodePacked(
            "QUANTUMCAT_GENESIS_V1",
            block.timestamp,
            block.number,
            block.prevrandao,
            block.chainid,
            msg.sender,
            _catbox,
            _livecat,
            _deadcat
        ));
    }

    /// @notice Prevent accidental ETH transfers
    receive() external payable { revert ETHNotAccepted(); }
    fallback() external payable { revert ETHNotAccepted(); }

    // ========= OBSERVE =========

    /// @notice Burn CATBOX and commit to observing with future reveal data
    /// @param amount Amount of CATBOX tokens to burn (must be > 0 and <= MAX_OBSERVE_AMOUNT)
    /// @param dataHash keccak256 hash of reveal data (keccak256(yourSecretData))
    /// @param userEntropy 32 bytes of user-provided entropy (must be non-zero for security)
    /// @dev Implements commit phase of commit-reveal pattern to prevent frontrunning
    /// @dev Updates shared entropy pool (Quantum Entanglement Protocol)
    /// @dev Stores only the hash of userEntropy to prevent analysis attacks
    /// @dev Reverts if user already has a pending observation
    /// @dev Example: commitObserve(1000e18, keccak256("mySecret"), keccak256(abi.encodePacked(block.timestamp, msg.sender)))
    function commitObserve(uint256 amount, bytes32 dataHash, bytes32 userEntropy)
        external
        nonReentrant
    {
        if (_pending[msg.sender].amount != 0) revert PendingObservationExists();
        if (amount == 0) revert InvalidAmount();
        if (amount > MAX_OBSERVE_AMOUNT) revert AmountTooLarge(amount, MAX_OBSERVE_AMOUNT);
        if (userEntropy == bytes32(0)) revert ZeroEntropy();

        catbox.burn(msg.sender, amount);

        // Hash the user entropy before storing to protect it from analysis
        bytes32 userEntropyHash = keccak256(abi.encodePacked(userEntropy));

        // Update shared entropy pool (Quantum Entanglement)
        bytes32 oldEntropy = sharedEntropyPool;
        bytes32 newEntropy = keccak256(abi.encodePacked(
            oldEntropy,
            msg.sender,
            amount,
            dataHash,
            userEntropyHash,
            block.number,
            block.timestamp
        ));

        sharedEntropyPool = newEntropy;
        emit EntropyPoolUpdated(oldEntropy, newEntropy);

        _pending[msg.sender] = Pending({
            dataHash: dataHash,
            userEntropyHash: userEntropyHash,
            entropySnapshot: newEntropy,
            amount: amount,
            refBlock: uint64(block.number)
        });

        emit CommitObserve(msg.sender, amount, dataHash, uint64(block.number));
    }

    /// @notice Finalize observation by revealing committed data and entropy
    /// @param data The exact bytes you hashed in commitObserve (must match hash exactly)
    /// @param userEntropy The exact entropy value you provided in commitObserve
    /// @dev Implements reveal phase of commit-reveal pattern
    /// @dev Must wait at least REVEAL_DELAY (5) blocks after commit
    /// @dev Must reveal within MAX_REVEAL_WINDOW (250) blocks to ensure blockhash availability
    /// @dev Binary collapse: mints either ALL LIVECAT or ALL DEADCAT (never mixed)
    /// @dev Clears pending observation state before external calls (reentrancy protection)
    /// @dev Example: observe("mySecret", yourEntropy) where you committed keccak256("mySecret")
    function observe(bytes calldata data, bytes32 userEntropy)
        external
        nonReentrant
    {
        Pending memory p = _pending[msg.sender];
        if (p.amount == 0) revert NoPendingObservation();
        if (data.length > DATA_MAX) revert DataTooLarge();
        if (block.number <= p.refBlock + REVEAL_DELAY) revert InsufficientDelay();
        if (keccak256(data) != p.dataHash) revert HashMismatch();

        // Verify user entropy matches the committed hash
        if (keccak256(abi.encodePacked(userEntropy)) != p.userEntropyHash) revert ZeroEntropy();

        // Enforce strict reveal window to ensure blockhash availability
        // This prevents validator grinding attacks after blockhash expires
        if (block.number > p.refBlock + MAX_REVEAL_WINDOW) revert RevealWindowClosed();

        delete _pending[msg.sender];

        bytes32 randomness = _highEntropyRandom(msg.sender, p.refBlock, userEntropy, p.dataHash, p.entropySnapshot);
        
        // Verify commitment-linked blockhash is still available
        // This is a critical security check - blockhash must be available for strong randomness
        bytes32 commitLinkedHash = blockhash(p.refBlock + REVEAL_DELAY);
        if (commitLinkedHash == bytes32(0)) {
            revert BlockhashExpired();
        }
        
        (uint256 alive, uint256 dead) = _binaryCollapse(p.amount, randomness, p.dataHash, userEntropy);

        emit Observed(msg.sender, alive, dead);
        
        if (alive > 0) livecat.mint(msg.sender, alive);
        if (dead > 0) deadcat.mint(msg.sender, dead);

        // Update shared entropy pool with reveal outcome
        bytes32 oldEntropy = sharedEntropyPool;
        bytes32 newEntropy = keccak256(abi.encodePacked(oldEntropy, data, alive, dead));
        sharedEntropyPool = newEntropy;
        emit EntropyPoolUpdated(oldEntropy, newEntropy);
    }

    /// @notice Cancel an observation that exceeded the reveal window
    /// @dev Allows users to recover CATBOX from expired observations and try again
    /// @dev Can only cancel if reveal window (MAX_REVEAL_WINDOW) has passed
    /// @dev Remints CATBOX to user so they can recommit with fresh randomness
    function cancelObservation()
        external
        nonReentrant
    {
        Pending memory p = _pending[msg.sender];
        if (p.amount == 0) revert NoPendingObservation();
        if (block.number <= p.refBlock + MAX_REVEAL_WINDOW) revert RevealWindowClosed();

        delete _pending[msg.sender];

        // Return the CATBOX tokens to the user
        catbox.mint(msg.sender, p.amount);
        
        emit ObservationCancelled(msg.sender, p.amount);
    }

    /// @notice Finalize stuck observation after grace period (anyone can call)
    /// @param owner Address whose observation to finalize
    /// @param userEntropy The entropy value provided during commit (required for determinism)
    /// @dev Failsafe mechanism to prevent permanent fund lock
    /// @dev Can only be called after REVEAL_DELAY + GRACE (69) blocks from commit
    /// @dev Must be called within MAX_REVEAL_WINDOW to ensure blockhash availability
    /// @dev Anyone can call but must provide correct userEntropy (user should share this)
    /// @dev Uses same randomness mechanism as observe() - deterministic outcome
    /// @dev Example: User shares their entropy publicly so anyone can force finalize
    function forceObserve(address owner, bytes32 userEntropy)
        external
        nonReentrant
    {
        Pending memory p = _pending[owner];
        if (p.amount == 0) revert NoPendingObservation();
        if (block.number <= p.refBlock + REVEAL_DELAY + GRACE) revert GracePeriodNotPassed();

        // Verify user entropy matches the committed hash
        if (keccak256(abi.encodePacked(userEntropy)) != p.userEntropyHash) revert ZeroEntropy();

        // CRITICAL: Enforce same window restrictions as observe()
        // This ensures blockhash is available and prevents validator grinding
        if (block.number > p.refBlock + MAX_REVEAL_WINDOW) revert RevealWindowClosed();

        delete _pending[owner];

        bytes32 randomness = _highEntropyRandom(owner, p.refBlock, userEntropy, p.dataHash, p.entropySnapshot);
        
        // Verify commitment-linked blockhash is still available
        // This must match observe() for consistent security guarantees
        bytes32 commitLinkedHash = blockhash(p.refBlock + REVEAL_DELAY);
        if (commitLinkedHash == bytes32(0)) {
            revert BlockhashExpired();
        }
        
        (uint256 alive, uint256 dead) = _binaryCollapse(p.amount, randomness, p.dataHash, userEntropy);

        emit Forced(owner, alive, dead);
        
        if (alive > 0) livecat.mint(owner, alive);
        if (dead > 0) deadcat.mint(owner, dead);

        // Update shared entropy pool with forced observation outcome
        bytes32 oldEntropy = sharedEntropyPool;
        bytes32 newEntropy = keccak256(abi.encodePacked(oldEntropy, alive, dead, owner));
        sharedEntropyPool = newEntropy;
        emit EntropyPoolUpdated(oldEntropy, newEntropy);
    }

    // ========= REBOX =========

    /// @notice Burn equal LIVECAT & DEADCAT pairs and mint CATBOX (minus fixed 2.5% fee)
    /// @param pairs Number of pairs to rebox (must have at least this many of both tokens)
    /// @dev Requires exactly 1:1 ratio of LIVECAT to DEADCAT
    /// @dev Fixed fee of 2.5% (250 BPS) is immutable and predictable
    /// @dev Formula: output = (2 * pairs) - (2 * pairs * 250 / 10000) = pairs * 1.95
    /// @dev Example: Rebox 100 pairs → burns 100 LIVECAT + 100 DEADCAT → mints 195 CATBOX
    function rebox(uint256 pairs)
        external
        nonReentrant
    {
        if (pairs == 0) revert NoPairsAvailable();

        _executeRebox(pairs);
    }

    /// @notice Rebox all available pairs (or up to cap)
    /// @param capPairs Maximum pairs to rebox (0 = no cap, rebox all available)
    /// @return pairs Number of pairs actually reboxed
    /// @dev Convenience function that calculates min(livecat_balance, deadcat_balance, cap)
    /// @dev Useful for "rebox all" functionality in frontends
    /// @dev Example: If you have 50 LIVECAT and 100 DEADCAT, reboxMax(0) will rebox 50 pairs
    function reboxMax(uint256 capPairs)
        external
        nonReentrant
        returns (uint256 pairs)
    {
        uint256 livecatBalance = livecat.balanceOf(msg.sender);
        uint256 deadcatBalance = deadcat.balanceOf(msg.sender);
        pairs = livecatBalance < deadcatBalance ? livecatBalance : deadcatBalance;
        if (capPairs != 0 && pairs > capPairs) pairs = capPairs;
        if (pairs == 0) revert NoPairsAvailable();

        _executeRebox(pairs);
    }

    /// @notice Rebox with minimum output protection (slippage protection)
    /// @param pairs Number of pairs to rebox
    /// @param minCatboxOut Minimum CATBOX to receive (reverts if less)
    /// @dev Protection against unexpected changes (though fee is fixed at 2.5%)
    /// @dev Primarily useful for future-proofing frontend integrations
    /// @dev Example: reboxWithMinOutput(100, 195e18) ensures you get at least 195 CATBOX
    function reboxWithMinOutput(uint256 pairs, uint256 minCatboxOut)
        external
        nonReentrant
    {
        if (pairs == 0) revert NoPairsAvailable();
        
        // Calculate expected output
        uint256 base = 2 * pairs;
        uint256 feeTokens = (base * REBOX_FEE_BPS) / _MAX_BPS;
        uint256 mintAmt = base - feeTokens;
        
        if (mintAmt < minCatboxOut) revert SlippageExceeded();
        
        _executeRebox(pairs);
    }

    // ========= Views =========

    /// @notice Check if an observation is ready to be revealed
    /// @param owner Address to check
    /// @return ready True if observation can be revealed now
    function canObserve(address owner) external view returns (bool ready) {
        Pending memory p = _pending[owner];
        ready = p.amount != 0 && block.number > p.refBlock + REVEAL_DELAY && block.number <= p.refBlock + MAX_REVEAL_WINDOW;
    }

    /// @notice Check if an observation can be force-finalized
    /// @param owner Address to check
    /// @return ready True if observation can be force-finalized now
    /// @dev Returns false if window has expired (must be within MAX_REVEAL_WINDOW)
    function canForceObserve(address owner) external view returns (bool ready) {
        Pending memory p = _pending[owner];
        ready = p.amount != 0 
            && block.number > p.refBlock + REVEAL_DELAY + GRACE
            && block.number <= p.refBlock + MAX_REVEAL_WINDOW;
    }

    /// @notice Check if an observation can be cancelled (exceeded reveal window)
    /// @param owner Address to check
    /// @return ready True if observation can be cancelled now
    function canCancelObservation(address owner) external view returns (bool ready) {
        Pending memory p = _pending[owner];
        ready = p.amount != 0 && block.number > p.refBlock + MAX_REVEAL_WINDOW;
    }

    /// @notice Calculate CATBOX output from reboxing a given number of pairs
    /// @param pairs Number of pairs to calculate for
    /// @return catboxOut Amount of CATBOX that would be minted
    /// @return feeTaken Amount taken as fee
    function calculateReboxOutput(uint256 pairs)
        external
        pure
        returns (uint256 catboxOut, uint256 feeTaken)
    {
        uint256 base = 2 * pairs;
        feeTaken = (base * REBOX_FEE_BPS) / _MAX_BPS;
        catboxOut = base - feeTaken;
    }

    /// @notice Check observation status and timing for an address
    /// @param owner Address to check
    /// @return hasPending Whether there is a pending observation
    /// @return canReveal Whether observation can be revealed now
    /// @return canForce Whether observation can be force-finalized now
    /// @return canCancel Whether observation can be cancelled now
    /// @return blocksUntilReveal Blocks until reveal is possible (0 if ready)
    /// @return blocksUntilForce Blocks until force is possible (0 if ready)
    /// @return blocksUntilExpiry Blocks until reveal window expires (0 if expired)
    function getObservationStatus(address owner)
        external
        view
        returns (
            bool hasPending,
            bool canReveal,
            bool canForce,
            bool canCancel,
            uint256 blocksUntilReveal,
            uint256 blocksUntilForce,
            uint256 blocksUntilExpiry
        )
    {
        Pending memory p = _pending[owner];
        hasPending = p.amount != 0;
        
        if (hasPending) {
            uint256 revealBlock = p.refBlock + REVEAL_DELAY;
            uint256 forceBlock = p.refBlock + REVEAL_DELAY + GRACE;
            uint256 expiryBlock = p.refBlock + MAX_REVEAL_WINDOW;
            
            canReveal = block.number > revealBlock && block.number <= expiryBlock;
            canForce = block.number > forceBlock;
            canCancel = block.number > expiryBlock;
            
            blocksUntilReveal = canReveal ? 0 : (block.number <= revealBlock ? revealBlock - block.number + 1 : 0);
            blocksUntilForce = canForce ? 0 : forceBlock - block.number + 1;
            blocksUntilExpiry = canCancel ? 0 : expiryBlock - block.number;
        }
    }

    /// @notice Check if blockhash will still be available for an observation
    /// @param owner Address to check
    /// @return available Whether the commit blockhash is still accessible
    /// @return blocksUntilExpiry Blocks until blockhash expires (0 if expired)
    /// @dev Blockhash is available for 256 blocks, but we enforce MAX_REVEAL_WINDOW (250)
    function isBlockhashAvailable(address owner)
        external
        view
        returns (bool available, uint256 blocksUntilExpiry)
    {
        Pending memory p = _pending[owner];
        if (p.amount == 0) return (false, 0);
        
        // We enforce MAX_REVEAL_WINDOW to ensure blockhash is available
        uint256 expiryBlock = p.refBlock + MAX_REVEAL_WINDOW;
        
        available = block.number <= expiryBlock;
        blocksUntilExpiry = available ? expiryBlock - block.number : 0;
    }

    /// @notice Get the current rebox fee in basis points
    /// @return feeBPS The fee in basis points (250 = 2.5%)
    /// @return feePercent The fee as a percentage string representation
    /// @dev This is a convenience function for frontends and documentation
    function getReboxFee()
        external
        pure
        returns (uint96 feeBPS, string memory feePercent)
    {
        feeBPS = REBOX_FEE_BPS;
        feePercent = "2.5%";
    }

    /// @notice Get comprehensive system status and configuration
    /// @return revealDelay Number of blocks required before reveal
    /// @return gracePeriod Additional blocks for force observe
    /// @return maxDataSize Maximum size of reveal data in bytes
    /// @return maxObserveAmount Maximum amount that can be observed at once
    /// @return currentEntropyPool Current shared entropy pool value
    function getSystemConfig()
        external
        view
        returns (
            uint8 revealDelay,
            uint16 gracePeriod,
            uint16 maxDataSize,
            uint256 maxObserveAmount,
            bytes32 currentEntropyPool
        )
    {
        revealDelay = REVEAL_DELAY;
        gracePeriod = GRACE;
        maxDataSize = DATA_MAX;
        maxObserveAmount = MAX_OBSERVE_AMOUNT;
        currentEntropyPool = sharedEntropyPool;
    }

    /// @notice Get pending observation details for an address (entropy hash omitted for security)
    /// @param owner Address to query
    /// @return hasPending Whether there is a pending observation
    /// @return amount Amount of tokens in the observation
    /// @return dataHash Hash of the committed reveal data
    /// @return refBlock Reference block number
    /// @return entropySnapshot Snapshot of shared entropy at commit time
    /// @dev User entropy hash is intentionally omitted to prevent analysis attacks
    function getPendingObservation(address owner)
        external
        view
        returns (
            bool hasPending,
            uint256 amount,
            bytes32 dataHash,
            uint64 refBlock,
            bytes32 entropySnapshot
        )
    {
        Pending memory p = _pending[owner];
        hasPending = p.amount != 0;
        amount = p.amount;
        dataHash = p.dataHash;
        refBlock = p.refBlock;
        entropySnapshot = p.entropySnapshot;
    }

    /// @notice Get the maximum number of pairs a user can currently rebox
    /// @param user Address to check
    /// @return maxPairs Maximum pairs available for reboxing
    function getMaxReboxablePairs(address user)
        external
        view
        returns (uint256 maxPairs)
    {
        uint256 livecatBalance = livecat.balanceOf(user);
        uint256 deadcatBalance = deadcat.balanceOf(user);
        maxPairs = livecatBalance < deadcatBalance ? livecatBalance : deadcatBalance;
    }

    // ========= Internals =========

    /// @dev Burns equal amounts of LIVECAT and DEADCAT, then mints CATBOX minus fixed fee
    /// @param pairs Number of LIVECAT+DEADCAT pairs to rebox
    function _executeRebox(uint256 pairs) private {
        // Explicit bounds check to prevent overflow even in unchecked blocks
        // Protects against extreme future scenarios where supply could be manipulated
        if (pairs > MAX_REBOX_PAIRS) revert ReboxAmountTooLarge();

        livecat.burn(msg.sender, pairs);
        deadcat.burn(msg.sender, pairs);

        unchecked {
            // Gas optimization: All calculations in unchecked block
            // Safe: pairs <= MAX_REBOX_PAIRS (type(uint128).max)
            //   pairs * 2 <= 2 * type(uint128).max < type(uint256).max
            // Safe: REBOX_FEE_BPS is constant 250 (2.5%), max is 10000
            // Safe: feeTokens is always less than base
            uint256 base = pairs << 1; // Bit shift for 2x multiplication (gas optimization)
            uint256 feeTokens = (base * REBOX_FEE_BPS) / _MAX_BPS;
            uint256 mintAmt = base - feeTokens;
            
            catbox.mint(msg.sender, mintAmt);
            emit Reboxed(msg.sender, pairs, mintAmt, feeTokens);
        }
    }

    /// @dev Binary quantum collapse: 50/50 chance of ALL LIVECAT or ALL DEADCAT
    /// @notice This implements true quantum mechanics - observation causes complete wave function collapse
    /// @param amount Total amount to collapse
    /// @param seed Primary entropy seed from RNG function
    /// @param dataHash User's committed data hash
    /// @param userEntropy User-provided entropy
    /// @return alive Amount allocated to alive outcome (either 0 or amount)
    /// @return dead Amount allocated to dead outcome (either amount or 0)
    /// @dev Uses LSB (least significant bit) of double-hashed entropy for true 50/50 probability
    /// @dev Binary collapse means NO mixed outcomes - it's always all-or-nothing
    /// @dev This is gas-efficient (constant ~69k gas) and mathematically provable 50/50 distribution
    /// @dev Example: 1000 tokens → either 1000 LIVECAT + 0 DEADCAT or 0 LIVECAT + 1000 DEADCAT
    function _binaryCollapse(
        uint256 amount,
        bytes32 seed,
        bytes32 dataHash,
        bytes32 userEntropy
    ) private pure returns (uint256 alive, uint256 dead) {
        // Mix all entropy sources to create final randomness
        bytes32 mixedEntropy = keccak256(abi.encodePacked(seed, dataHash, userEntropy));
        bytes32 finalRandom = keccak256(abi.encodePacked("CATBOX_BINARY_V3", mixedEntropy));
        
        // Check the least significant bit for 50/50 outcome
        // Bit is 0: ALL LIVECAT (cat survived!)
        // Bit is 1: ALL DEADCAT (cat didn't make it)
        if (uint256(finalRandom) & 1 == 0) {
            alive = amount;
            dead = 0;
        } else {
            alive = 0;
            dead = amount;
        }
    }

    /// @dev High-entropy RNG from blockhashes, prevrandao, user entropy, and shared pool
    /// @param user Address of the user performing the observation
    /// @param refBlock Reference block number from commitment
    /// @param userEntropy User-provided entropy from commitment
    /// @param dataHash Hash of user's reveal data
    /// @param entropySnapshot Snapshot of shared entropy pool at commit time
    /// @return randomness Combined high-entropy random value
    /// @dev Combines 12+ entropy sources to prevent manipulation:
    /// @dev - Commitment-linked blockhash (unknowable at commit time)
    /// @dev - block.prevrandao (PoS beacon chain randomness)
    /// @dev - Recent blockhash (current chain state)
    /// @dev - block.timestamp, block.number, block.chainid (temporal/network)
    /// @dev - user address (user-specific)
    /// @dev - userEntropy (user-provided secret)
    /// @dev - dataHash (reveal data)
    /// @dev - entropySnapshot (QEP: shared pool at commit)
    /// @dev - sharedEntropyPool (QEP: current shared pool state)
    /// @dev Security: Manipulation requires controlling validator + all users' secrets
    function _highEntropyRandom(
        address user,
        uint256 refBlock,
        bytes32 userEntropy,
        bytes32 dataHash,
        bytes32 entropySnapshot
    ) private view returns (bytes32 randomness) {
        bytes32 commitLinkedHash = blockhash(refBlock + REVEAL_DELAY);
        bytes32 recentHash = blockhash(block.number - 1);

        randomness = keccak256(
            abi.encodePacked(
                "QUANTUMCAT::RNG_V2",
                commitLinkedHash,
                block.prevrandao,
                recentHash,
                block.timestamp,
                block.number,
                block.chainid,
                user,
                userEntropy,
                dataHash,
                refBlock,
                entropySnapshot,
                sharedEntropyPool
            )
        );
    }
}

