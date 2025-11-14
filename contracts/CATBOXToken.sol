// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title CATBOXToken - Superposed Quantum Cat Token
/// @notice ERC-20 token representing quantum cats in superposed state
/// @dev Only the controller contract can mint/burn. Immutable after deployment.
contract CATBOXToken is ERC20 {
    /// @notice Address of the controller contract (only address that can mint/burn)
    address public immutable controller;

    /// @notice Thrown when caller is not the controller
    error OnlyController();

    /// @notice Thrown when controller address is zero
    error ZeroAddress();

    /// @notice Emitted when tokens are minted by controller
    event ControllerMint(address indexed to, uint256 amount, uint256 newTotalSupply);

    /// @notice Emitted when tokens are burned by controller
    event ControllerBurn(address indexed from, uint256 amount, uint256 newTotalSupply);

    /// @dev Restricts function access to controller only
    modifier onlyController() {
        if (msg.sender != controller) revert OnlyController();
        _;
    }

    /// @notice Initializes the CATBOX token
    /// @param _controller Address of the QuantumCatController contract
    /// @param initialHolder Address to receive initial supply
    /// @param initialSupply Initial token supply (with 18 decimals)
    constructor(
        address _controller,
        address initialHolder,
        uint256 initialSupply
    ) ERC20("CatBox", "CATBOX") {
        if (_controller == address(0)) revert ZeroAddress();
        if (initialHolder == address(0)) revert ZeroAddress();
        
        controller = _controller;
        _mint(initialHolder, initialSupply);
    }

    /// @notice Mint tokens (controller only)
    /// @param to Address to mint tokens to
    /// @param amount Amount of tokens to mint
    /// @dev Emits ControllerMint event for monitoring and anomaly detection
    function mint(address to, uint256 amount) external onlyController {
        _mint(to, amount);
        emit ControllerMint(to, amount, totalSupply());
    }

    /// @notice Burn tokens from an address (controller only)
    /// @param from Address to burn tokens from
    /// @param amount Amount of tokens to burn
    /// @dev Emits ControllerBurn event for monitoring and anomaly detection
    function burn(address from, uint256 amount) external onlyController {
        _burn(from, amount);
        emit ControllerBurn(from, amount, totalSupply());
    }
}

