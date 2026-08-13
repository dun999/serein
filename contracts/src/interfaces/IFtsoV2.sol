// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal view of FTSOv2 on Coston2 (0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d).
/// @dev Only the call Covenant needs. XRP/USD is a free feed: calculateFeeById returns 0.
interface IFtsoV2 {
    /// @param _feedId 21-byte feed id; XRP/USD is 0x015852502f55534400000000000000000000000000
    /// @return _value Feed value, scaled by 10**_decimals
    /// @return _decimals Number of decimals in _value
    /// @return _timestamp Unix time the value was produced
    function getFeedById(bytes21 _feedId)
        external
        payable
        returns (uint256 _value, int8 _decimals, uint64 _timestamp);

    function calculateFeeById(bytes21 _feedId) external view returns (uint256 _fee);
}
