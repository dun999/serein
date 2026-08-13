// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The slice of ERC-20 Covenant needs to govern FXRP.
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    /// @dev Needed so the FAssets AssetManager can burn this contract's FXRP
    /// during a redemption. Granted per redemption and consumed by it.
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}
