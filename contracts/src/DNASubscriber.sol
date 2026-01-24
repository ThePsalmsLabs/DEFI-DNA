// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ISubscriber} from "@uniswap/v4-periphery/src/interfaces/ISubscriber.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    PositionInfo,
    PositionInfoLibrary
} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

/// @notice Minimal interface for PositionManager functions we need
interface IPositionManagerMinimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function getPoolAndPositionInfo(uint256 tokenId)
        external
        view
        returns (PoolKey memory, PositionInfo);
}

/// @notice Minimal interface for StateView functions we need
interface IStateViewMinimal {
    function getSlot0(PoolId poolId) external view returns (uint160, int24, uint24, uint24);
    function getLiquidity(PoolId poolId) external view returns (uint128);
    function getFeeGrowthGlobals(PoolId poolId) external view returns (uint256, uint256);
}

/// @title DNASubscriber
/// @notice Enhanced subscriber that tracks user actions, milestones, and stats on-chain
/// @dev Implements ISubscriber interface for Uniswap V4 Position Manager integration
contract DNASubscriber is ISubscriber {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using PositionInfoLibrary for PositionInfo;

    // ============ Events ============

    /// @notice Emitted when a user performs any action
    event UserAction(
        address indexed user,
        PoolId indexed poolId,
        uint256 indexed tokenId,
        ActionType actionType,
        uint128 liquidity,
        int128 feesAccrued0,
        int128 feesAccrued1,
        uint256 timestamp
    );

    /// @notice Emitted when a user reaches a milestone
    event UserMilestone(
        address indexed user, MilestoneType milestoneType, uint256 value, uint256 timestamp
    );

    /// @notice Emitted when user stats are updated
    event StatsUpdated(
        address indexed user, uint32 totalPositions, uint32 activePositions, uint128 totalFeesEarned
    );

    // ============ Errors ============

    /// @notice Thrown when caller is not authorized
    error Unauthorized();

    /// @notice Thrown when caller is not allowed to call recordSwap
    error InvalidCaller();

    // ============ Enums ============

    enum ActionType {
        SUBSCRIBE,
        UNSUBSCRIBE,
        MODIFY_LIQUIDITY,
        BURN,
        COLLECT_FEES
    }

    enum MilestoneType {
        FIRST_POSITION,
        FIRST_V4_POSITION,
        TOTAL_VOLUME_1K,
        TOTAL_VOLUME_10K,
        TOTAL_VOLUME_100K,
        TOTAL_VOLUME_1M,
        POSITIONS_COUNT_10,
        POSITIONS_COUNT_50,
        POSITIONS_COUNT_100,
        UNIQUE_POOLS_5,
        UNIQUE_POOLS_20,
        UNIQUE_POOLS_50,
        FEES_EARNED_100,
        FEES_EARNED_1000,
        FEES_EARNED_10000
    }

    // ============ Structs ============

    /// @notice User statistics stored on-chain
    struct UserStats {
        uint64 firstActionTimestamp;
        uint64 lastActionTimestamp;
        uint32 totalPositions;
        uint32 activePositions;
        uint32 uniquePools;
        uint32 totalSwaps;
        uint128 totalLiquidityProvided;
        uint128 totalFeesEarned;
        uint128 totalVolumeUsd; // Scaled by 1e18
    }

    /// @notice Position data for tracking
    struct PositionData {
        address owner;
        PoolId poolId;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint64 createdAt;
        bool isActive;
    }

    /// @notice Milestone tracking
    struct MilestoneStatus {
        bool firstPosition;
        bool firstV4Position;
        bool volume1K;
        bool volume10K;
        bool volume100K;
        bool volume1M;
        bool positions10;
        bool positions50;
        bool positions100;
        bool pools5;
        bool pools20;
        bool pools50;
        bool fees100;
        bool fees1000;
        bool fees10000;
    }

    // ============ State Variables ============

    /// @notice Position Manager contract
    IPositionManagerMinimal public immutable posm;

    /// @notice State View contract for reading pool state
    IStateViewMinimal public immutable stateView;

    /// @notice Owner of this contract (can manage allowlist)
    address public owner;

    /// @notice Allowed callers for recordSwap (trusted hooks/indexers)
    mapping(address => bool) public allowedCallers;

    /// @notice User statistics
    mapping(address => UserStats) public userStats;

    /// @notice User milestone status
    mapping(address => MilestoneStatus) public userMilestones;

    /// @notice Pool interaction tracking per user (using bytes32 for PoolId storage)
    mapping(address => mapping(bytes32 => bool)) public userPoolInteraction;

    /// @notice Token ID to position data
    mapping(uint256 => PositionData) public positions;

    /// @notice Owner to list of token IDs
    mapping(address => uint256[]) public ownerTokenIds;

    /// @notice All registered users
    address[] public allUsers;

    /// @notice User index for existence check
    mapping(address => bool) public isRegisteredUser;

    /// @notice Total protocol statistics
    uint256 public totalUsers;
    uint256 public totalPositionsCreated;
    uint256 public totalFeesCollected;

    // ============ Modifiers ============

    modifier onlyPositionManager() {
        require(msg.sender == address(posm), "DNASubscriber: not PositionManager");
        _;
    }

    // ============ Constructor ============

    constructor(address _posm, address _stateView) {
        posm = IPositionManagerMinimal(_posm);
        stateView = IStateViewMinimal(_stateView);
        owner = msg.sender;
    }

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAllowedCaller() {
        if (!allowedCallers[msg.sender] && msg.sender != owner) revert InvalidCaller();
        _;
    }

    // ============ ISubscriber Implementation ============

    /// @notice Called when a position subscribes to this subscriber
    /// @param tokenId The token ID of the position
    /// @param data Additional data (unused for now)
    function notifySubscribe(uint256 tokenId, bytes memory data) external onlyPositionManager {
        // Get position info from Position Manager
        (PoolKey memory key, PositionInfo info) = posm.getPoolAndPositionInfo(tokenId);
        PoolId poolId = key.toId();
        bytes32 poolIdBytes = PoolId.unwrap(poolId);
        address owner = posm.ownerOf(tokenId);
        uint128 liquidity = posm.getPositionLiquidity(tokenId);

        // Get tick range from position info using PositionInfoLibrary
        int24 tickLower = info.tickLower();
        int24 tickUpper = info.tickUpper();

        // Check if position was previously subscribed (e.g., after transfer)
        PositionData storage pos = positions[tokenId];
        bool isResubscribe = PoolId.unwrap(pos.poolId) == PoolId.unwrap(poolId) && !pos.isActive;
        address oldOwner = pos.owner;

        // Register user if new
        if (!isRegisteredUser[owner]) {
            _registerUser(owner);
        }

        // Update user stats
        UserStats storage stats = userStats[owner];
        stats.lastActionTimestamp = uint64(block.timestamp);

        if (!isResubscribe) {
            // New position
            stats.totalPositions++;
            totalPositionsCreated++;
        } else if (oldOwner != owner) {
            // Ownership changed - update mappings
            _syncOwnership(tokenId, oldOwner, owner);
        }

        stats.activePositions++;
        stats.totalLiquidityProvided += liquidity;

        // Track unique pools
        if (!userPoolInteraction[owner][poolIdBytes]) {
            userPoolInteraction[owner][poolIdBytes] = true;
            stats.uniquePools++;
            _checkPoolMilestones(owner, stats.uniquePools);
        }

        // Update or create position data
        positions[tokenId] = PositionData({
            owner: owner,
            poolId: poolId,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            createdAt: isResubscribe ? pos.createdAt : uint64(block.timestamp), // Keep original
            // creation time
            isActive: true
        });

        // Add to owner's token list if not already there
        if (!isResubscribe || oldOwner != owner) {
            ownerTokenIds[owner].push(tokenId);
        }

        // Check position milestones
        _checkPositionMilestones(owner, stats.totalPositions);

        emit UserAction(
            owner, poolId, tokenId, ActionType.SUBSCRIBE, liquidity, 0, 0, block.timestamp
        );

        emit StatsUpdated(owner, stats.totalPositions, stats.activePositions, stats.totalFeesEarned);
    }

    /// @notice Called when a position unsubscribes
    /// @dev This is called on transfer - we sync ownership if position still exists
    /// @param tokenId The token ID of the position
    function notifyUnsubscribe(uint256 tokenId) external onlyPositionManager {
        PositionData storage pos = positions[tokenId];
        require(pos.isActive, "DNASubscriber: position not active");

        address oldOwner = pos.owner;
        PoolId poolId = pos.poolId;

        // Check current owner - if different, this is a transfer
        address currentOwner = posm.ownerOf(tokenId);

        // Update user stats for old owner
        UserStats storage oldStats = userStats[oldOwner];
        oldStats.activePositions--;
        oldStats.lastActionTimestamp = uint64(block.timestamp);

        // Mark position as inactive (will be reactivated if new owner subscribes)
        pos.isActive = false;

        // If ownership changed (transfer case), sync ownership
        if (currentOwner != oldOwner && currentOwner != address(0)) {
            _syncOwnership(tokenId, oldOwner, currentOwner);
        }

        emit UserAction(oldOwner, poolId, tokenId, ActionType.UNSUBSCRIBE, 0, 0, 0, block.timestamp);

        emit StatsUpdated(
            oldOwner, oldStats.totalPositions, oldStats.activePositions, oldStats.totalFeesEarned
        );
    }

    /// @notice Called when liquidity is modified
    /// @param tokenId The token ID
    /// @param liquidityChange The change in liquidity
    /// @param feesAccrued The fees accrued as BalanceDelta
    function notifyModifyLiquidity(
        uint256 tokenId,
        int256 liquidityChange,
        BalanceDelta feesAccrued
    ) external onlyPositionManager {
        PositionData storage pos = positions[tokenId];
        require(pos.isActive, "DNASubscriber: position not active");

        address owner = pos.owner;
        UserStats storage stats = userStats[owner];
        stats.lastActionTimestamp = uint64(block.timestamp);

        // Update position liquidity
        if (liquidityChange > 0) {
            pos.liquidity += uint128(uint256(liquidityChange));
            stats.totalLiquidityProvided += uint128(uint256(liquidityChange));
        } else if (liquidityChange < 0) {
            uint128 decrease = uint128(uint256(-liquidityChange));
            if (decrease > pos.liquidity) {
                pos.liquidity = 0;
            } else {
                pos.liquidity -= decrease;
            }
        }

        // Extract fees from BalanceDelta
        int128 fees0 = feesAccrued.amount0();
        int128 fees1 = feesAccrued.amount1();

        // Track positive fees (fees collected)
        if (fees0 > 0 || fees1 > 0) {
            // Sum up absolute fees for tracking (simplified)
            uint128 totalFees = 0;
            if (fees0 > 0) totalFees += uint128(uint256(int256(fees0)));
            if (fees1 > 0) totalFees += uint128(uint256(int256(fees1)));

            stats.totalFeesEarned += totalFees;
            totalFeesCollected += totalFees;
            _checkFeesMilestones(owner, stats.totalFeesEarned);
        }

        emit UserAction(
            owner,
            pos.poolId,
            tokenId,
            ActionType.MODIFY_LIQUIDITY,
            liquidityChange > 0 ? uint128(uint256(liquidityChange)) : 0,
            fees0,
            fees1,
            block.timestamp
        );

        emit StatsUpdated(owner, stats.totalPositions, stats.activePositions, stats.totalFeesEarned);
    }

    /// @notice Called when a position is burned
    /// @param tokenId The token ID
    /// @param owner The owner of the position
    /// @param info Position info (packed)
    /// @param liquidity The liquidity burned
    /// @param feesAccrued The fees accrued as BalanceDelta
    function notifyBurn(
        uint256 tokenId,
        address owner,
        PositionInfo info,
        uint256 liquidity,
        BalanceDelta feesAccrued
    ) external onlyPositionManager {
        PositionData storage pos = positions[tokenId];
        PoolId poolId = pos.poolId;

        // Update user stats
        UserStats storage stats = userStats[owner];
        if (pos.isActive) {
            stats.activePositions--;
        }
        stats.lastActionTimestamp = uint64(block.timestamp);

        // Extract fees from BalanceDelta
        int128 fees0 = feesAccrued.amount0();
        int128 fees1 = feesAccrued.amount1();

        if (fees0 > 0 || fees1 > 0) {
            uint128 totalFees = 0;
            if (fees0 > 0) totalFees += uint128(uint256(int256(fees0)));
            if (fees1 > 0) totalFees += uint128(uint256(int256(fees1)));

            stats.totalFeesEarned += totalFees;
            totalFeesCollected += totalFees;
            _checkFeesMilestones(owner, stats.totalFeesEarned);
        }

        // Mark position as inactive
        pos.isActive = false;
        pos.liquidity = 0;

        emit UserAction(
            owner,
            poolId,
            tokenId,
            ActionType.BURN,
            uint128(liquidity),
            fees0,
            fees1,
            block.timestamp
        );

        emit StatsUpdated(owner, stats.totalPositions, stats.activePositions, stats.totalFeesEarned);
    }

    // ============ External Functions ============

    /// @notice Record a swap action (called by external indexer or hook)
    /// @param user The user who swapped
    /// @param poolId The pool ID
    /// @param volumeUsd The volume in USD (scaled by 1e18)
    function recordSwap(address user, PoolId poolId, uint128 volumeUsd) external onlyAllowedCaller {
        bytes32 poolIdBytes = PoolId.unwrap(poolId);

        if (!isRegisteredUser[user]) {
            _registerUser(user);
        }

        UserStats storage stats = userStats[user];
        stats.totalSwaps++;
        stats.totalVolumeUsd += volumeUsd;
        stats.lastActionTimestamp = uint64(block.timestamp);

        // Track unique pools
        if (!userPoolInteraction[user][poolIdBytes]) {
            userPoolInteraction[user][poolIdBytes] = true;
            stats.uniquePools++;
            _checkPoolMilestones(user, stats.uniquePools);
        }

        _checkVolumeMilestones(user, stats.totalVolumeUsd);
    }

    // ============ View Functions ============

    /// @notice Get user stats
    /// @param user The user address
    /// @return stats The user statistics
    function getUserStats(address user) external view returns (UserStats memory) {
        return userStats[user];
    }

    /// @notice Get user milestone status
    /// @param user The user address
    /// @return status The milestone status
    function getUserMilestones(address user) external view returns (MilestoneStatus memory) {
        return userMilestones[user];
    }

    /// @notice Get position data
    /// @param tokenId The token ID
    /// @return data The position data
    function getPosition(uint256 tokenId) external view returns (PositionData memory) {
        return positions[tokenId];
    }

    /// @notice Get all token IDs for an owner
    /// @param owner The owner address
    /// @return tokenIds Array of token IDs
    function getOwnerTokenIds(address owner) external view returns (uint256[] memory) {
        return ownerTokenIds[owner];
    }

    /// @notice Get active positions for an owner
    /// @param owner The owner address
    /// @return activeTokenIds Array of active token IDs
    function getActivePositions(address owner) external view returns (uint256[] memory) {
        uint256[] storage allTokens = ownerTokenIds[owner];
        uint256 activeCount = 0;

        // Count active positions
        for (uint256 i = 0; i < allTokens.length; i++) {
            if (positions[allTokens[i]].isActive) {
                activeCount++;
            }
        }

        // Collect active positions
        uint256[] memory activeTokenIds = new uint256[](activeCount);
        uint256 j = 0;
        for (uint256 i = 0; i < allTokens.length; i++) {
            if (positions[allTokens[i]].isActive) {
                activeTokenIds[j] = allTokens[i];
                j++;
            }
        }

        return activeTokenIds;
    }

    /// @notice Check if user has interacted with a pool
    /// @param user The user address
    /// @param poolId The pool ID
    /// @return hasInteracted True if user has interacted
    function hasInteractedWithPool(address user, PoolId poolId) external view returns (bool) {
        return userPoolInteraction[user][PoolId.unwrap(poolId)];
    }

    /// @notice Get total number of registered users
    /// @return count The user count
    function getUserCount() external view returns (uint256) {
        return totalUsers;
    }

    /// @notice Get user at index
    /// @param index The index
    /// @return user The user address
    function getUserAtIndex(uint256 index) external view returns (address) {
        require(index < allUsers.length, "DNASubscriber: index out of bounds");
        return allUsers[index];
    }

    /// @notice Calculate user DNA score on-chain
    /// @param user The user address
    /// @return score The DNA score (0-100)
    function calculateDNAScore(address user) external view returns (uint256 score) {
        UserStats memory stats = userStats[user];

        if (stats.firstActionTimestamp == 0) {
            return 0;
        }

        // Early Adopter Score (20%)
        uint256 daysSinceFirst = (block.timestamp - stats.firstActionTimestamp) / 1 days;
        uint256 earlyAdopterScore = daysSinceFirst >= 365 ? 20 : (daysSinceFirst * 20) / 365;

        // Volume Score (25%)
        uint256 volumeScore = 0;
        uint256 volumeUsd = stats.totalVolumeUsd / 1e18;
        if (volumeUsd >= 10_000_000) volumeScore = 25;
        else if (volumeUsd >= 1_000_000) volumeScore = 20;
        else if (volumeUsd >= 100_000) volumeScore = 15;
        else if (volumeUsd >= 10_000) volumeScore = 10;
        else if (volumeUsd >= 1000) volumeScore = 5;

        // LP Efficiency Score (25%)
        uint256 efficiencyScore = 0;
        if (stats.totalLiquidityProvided > 0) {
            uint256 efficiency = (stats.totalFeesEarned * 10_000) / stats.totalLiquidityProvided;
            if (efficiency >= 500) efficiencyScore = 25;
            else if (efficiency >= 200) efficiencyScore = 20;
            else if (efficiency >= 100) efficiencyScore = 15;
            else if (efficiency >= 50) efficiencyScore = 10;
            else if (efficiency >= 10) efficiencyScore = 5;
        }

        // Diversity Score (15%)
        uint256 diversityScore = 0;
        if (stats.uniquePools >= 50) diversityScore = 15;
        else if (stats.uniquePools >= 20) diversityScore = 12;
        else if (stats.uniquePools >= 10) diversityScore = 9;
        else if (stats.uniquePools >= 5) diversityScore = 6;
        else if (stats.uniquePools >= 1) diversityScore = 3;

        // Consistency Score (15%)
        uint256 totalActions = stats.totalPositions + stats.totalSwaps;
        uint256 consistencyScore = 0;
        if (totalActions >= 500) consistencyScore = 15;
        else if (totalActions >= 200) consistencyScore = 12;
        else if (totalActions >= 100) consistencyScore = 9;
        else if (totalActions >= 50) consistencyScore = 6;
        else if (totalActions >= 10) consistencyScore = 3;

        score =
            earlyAdopterScore + volumeScore + efficiencyScore + diversityScore + consistencyScore;
    }

    /// @notice Get user tier based on DNA score
    /// @param user The user address
    /// @return tier The tier name
    function getUserTier(address user) external view returns (string memory tier) {
        uint256 score = this.calculateDNAScore(user);

        if (score >= 80) return "Whale";
        if (score >= 60) return "Expert";
        if (score >= 40) return "Intermediate";
        if (score >= 20) return "Beginner";
        return "Novice";
    }

    // ============ Internal Functions ============

    function _registerUser(address user) internal {
        isRegisteredUser[user] = true;
        allUsers.push(user);
        totalUsers++;

        userStats[user].firstActionTimestamp = uint64(block.timestamp);

        // Trigger both first position milestones for new users
        _checkMilestone(user, MilestoneType.FIRST_POSITION, 1);
        _checkMilestone(user, MilestoneType.FIRST_V4_POSITION, 1);
    }

    function _checkMilestone(address user, MilestoneType milestoneType, uint256 value) internal {
        MilestoneStatus storage status = userMilestones[user];
        bool shouldEmit = false;

        if (milestoneType == MilestoneType.FIRST_POSITION && !status.firstPosition) {
            status.firstPosition = true;
            shouldEmit = true;
        } else if (milestoneType == MilestoneType.FIRST_V4_POSITION && !status.firstV4Position) {
            status.firstV4Position = true;
            shouldEmit = true;
        }

        if (shouldEmit) {
            emit UserMilestone(user, milestoneType, value, block.timestamp);
        }
    }

    function _checkPositionMilestones(address user, uint32 count) internal {
        MilestoneStatus storage status = userMilestones[user];

        if (count >= 10 && !status.positions10) {
            status.positions10 = true;
            emit UserMilestone(user, MilestoneType.POSITIONS_COUNT_10, count, block.timestamp);
        }
        if (count >= 50 && !status.positions50) {
            status.positions50 = true;
            emit UserMilestone(user, MilestoneType.POSITIONS_COUNT_50, count, block.timestamp);
        }
        if (count >= 100 && !status.positions100) {
            status.positions100 = true;
            emit UserMilestone(user, MilestoneType.POSITIONS_COUNT_100, count, block.timestamp);
        }
    }

    function _checkPoolMilestones(address user, uint32 count) internal {
        MilestoneStatus storage status = userMilestones[user];

        if (count >= 5 && !status.pools5) {
            status.pools5 = true;
            emit UserMilestone(user, MilestoneType.UNIQUE_POOLS_5, count, block.timestamp);
        }
        if (count >= 20 && !status.pools20) {
            status.pools20 = true;
            emit UserMilestone(user, MilestoneType.UNIQUE_POOLS_20, count, block.timestamp);
        }
        if (count >= 50 && !status.pools50) {
            status.pools50 = true;
            emit UserMilestone(user, MilestoneType.UNIQUE_POOLS_50, count, block.timestamp);
        }
    }

    function _checkFeesMilestones(address user, uint128 totalFees) internal {
        MilestoneStatus storage status = userMilestones[user];
        uint256 feesInUnits = totalFees / 1e18;

        if (feesInUnits >= 100 && !status.fees100) {
            status.fees100 = true;
            emit UserMilestone(user, MilestoneType.FEES_EARNED_100, feesInUnits, block.timestamp);
        }
        if (feesInUnits >= 1000 && !status.fees1000) {
            status.fees1000 = true;
            emit UserMilestone(user, MilestoneType.FEES_EARNED_1000, feesInUnits, block.timestamp);
        }
        if (feesInUnits >= 10_000 && !status.fees10000) {
            status.fees10000 = true;
            emit UserMilestone(user, MilestoneType.FEES_EARNED_10000, feesInUnits, block.timestamp);
        }
    }

    function _checkVolumeMilestones(address user, uint128 totalVolume) internal {
        MilestoneStatus storage status = userMilestones[user];
        uint256 volumeInUnits = totalVolume / 1e18;

        if (volumeInUnits >= 1000 && !status.volume1K) {
            status.volume1K = true;
            emit UserMilestone(user, MilestoneType.TOTAL_VOLUME_1K, volumeInUnits, block.timestamp);
        }
        if (volumeInUnits >= 10_000 && !status.volume10K) {
            status.volume10K = true;
            emit UserMilestone(user, MilestoneType.TOTAL_VOLUME_10K, volumeInUnits, block.timestamp);
        }
        if (volumeInUnits >= 100_000 && !status.volume100K) {
            status.volume100K = true;
            emit UserMilestone(
                user, MilestoneType.TOTAL_VOLUME_100K, volumeInUnits, block.timestamp
            );
        }
        if (volumeInUnits >= 1_000_000 && !status.volume1M) {
            status.volume1M = true;
            emit UserMilestone(user, MilestoneType.TOTAL_VOLUME_1M, volumeInUnits, block.timestamp);
        }
    }

    /// @notice Sync ownership when a position is transferred
    /// @dev Updates internal mappings to reflect new owner
    /// @param tokenId The token ID
    /// @param oldOwner The previous owner
    /// @param newOwner The new owner
    function _syncOwnership(uint256 tokenId, address oldOwner, address newOwner) internal {
        // Update position owner
        positions[tokenId].owner = newOwner;

        // Remove from old owner's list (find and remove)
        uint256[] storage oldOwnerTokens = ownerTokenIds[oldOwner];
        for (uint256 i = 0; i < oldOwnerTokens.length; i++) {
            if (oldOwnerTokens[i] == tokenId) {
                // Swap with last element and pop
                oldOwnerTokens[i] = oldOwnerTokens[oldOwnerTokens.length - 1];
                oldOwnerTokens.pop();
                break;
            }
        }

        // Add to new owner's list (if not already there)
        uint256[] storage newOwnerTokens = ownerTokenIds[newOwner];
        bool alreadyExists = false;
        for (uint256 i = 0; i < newOwnerTokens.length; i++) {
            if (newOwnerTokens[i] == tokenId) {
                alreadyExists = true;
                break;
            }
        }
        if (!alreadyExists) {
            newOwnerTokens.push(tokenId);
        }

        // Register new owner if not registered
        if (!isRegisteredUser[newOwner]) {
            _registerUser(newOwner);
        }
    }

    // ============ Access Control Management ============

    /// @notice Set the owner (only callable by current owner)
    /// @param newOwner The new owner address
    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Add an allowed caller for recordSwap
    /// @param caller The address to allow
    function addAllowedCaller(address caller) external onlyOwner {
        allowedCallers[caller] = true;
    }

    /// @notice Remove an allowed caller for recordSwap
    /// @param caller The address to remove
    function removeAllowedCaller(address caller) external onlyOwner {
        allowedCallers[caller] = false;
    }

    /// @notice Public function to sync ownership (callable by anyone)
    /// @dev Useful for keeping data in sync after transfers
    /// @param tokenId The token ID to sync
    function syncOwnership(uint256 tokenId) external {
        PositionData storage pos = positions[tokenId];
        address currentOwner = posm.ownerOf(tokenId);

        // Only sync if ownership changed
        if (currentOwner != pos.owner && currentOwner != address(0)) {
            address oldOwner = pos.owner;
            _syncOwnership(tokenId, oldOwner, currentOwner);
        }
    }
}
