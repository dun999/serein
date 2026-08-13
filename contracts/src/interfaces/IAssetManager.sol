// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The slice of the FAssets AssetManager this contract needs.
///
/// @dev Both signatures were recovered from the deployed Coston2 diamond by
/// enumerating `facets()` and reading each facet's verified ABI, not from the
/// documentation. The documented shapes for this system have repeatedly not
/// matched what is deployed, and a mismatched tuple decodes silently rather
/// than reverting.
interface IAssetManager {
    /// @notice Burn FAssets and oblige an agent to pay the underlying asset.
    /// @param _amountUBA Amount in underlying base units — six decimals for XRP.
    /// @param _redeemerUnderlyingAddressString Where the agent must send the XRP.
    /// @param _executor Optional third party paid to finalise; zero for none.
    /// @return _redeemedAmountUBA Actual amount redeemed. It may be smaller
    /// than requested when there are insufficient tickets or the ticket-count
    /// limit is reached.
    function redeemAmount(
        uint256 _amountUBA,
        string calldata _redeemerUnderlyingAddressString,
        address _executor
    ) external payable returns (uint256 _redeemedAmountUBA);

    /// @notice Smallest redemption the system will accept.
    function minimumRedeemAmountUBA() external view returns (uint256);
}
