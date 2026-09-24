// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice One live memorial NFT or one owner's reservation per approved cemetery plot.
/// @dev The issuer attests to the offchain grave; the contract cannot verify GitHub or Supabase.
contract GravePlotNFT is ERC721, ERC2981, EIP712, AccessControl, ReentrancyGuard {
    uint256 public constant MAX_PLOTS = 666;
    uint256 public constant INITIAL_PLOT_CAP = 144;
    uint96 public constant ROYALTY_BPS = 500;
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "Claim(address wallet,bytes32 graveIdHash,bytes32 plotId,uint64 plotEpoch,bytes32 metadataHash,string uri,uint256 nonce,uint256 deadline)"
    );

    struct Claim {
        address wallet;
        bytes32 graveIdHash;
        bytes32 plotId;
        uint64 plotEpoch;
        bytes32 metadataHash;
        string uri;
        uint256 nonce;
        uint256 deadline;
    }

    uint256 public plotCount;
    uint256 public openPlotCap = INITIAL_PLOT_CAP;
    uint256 public activeSupply;
    uint256 private _nextTokenId = 1;
    bool public claimsPaused;
    bool public exhumationsPaused;

    mapping(bytes32 => bool) public approvedPlot;
    mapping(bytes32 => bool) public usedBurnCheckpoint;
    mapping(bytes32 => uint256) public activeTokenForPlot;
    mapping(bytes32 => address) public reservationHolder;
    mapping(bytes32 => uint64) public plotEpoch;
    mapping(bytes32 => bool) public usedGraveId;
    mapping(bytes32 => bool) public usedVoucher;
    mapping(uint256 => bytes32) public graveIdForToken;
    mapping(uint256 => bytes32) public plotIdForToken;
    mapping(uint256 => bytes32) public metadataHashForToken;
    mapping(uint256 => string) private _historicalURI;

    event PlotRegistered(bytes32 indexed plotId);
    event PlotCapRaised(uint256 previousCap, uint256 newCap, bytes32 indexed burnCheckpoint);
    event Claimed(uint256 indexed tokenId, bytes32 indexed plotId, bytes32 indexed graveIdHash, address owner, uint64 epoch);
    event Exhumed(uint256 indexed tokenId, bytes32 indexed plotId, bytes32 indexed graveIdHash, address burner, uint64 newEpoch);
    event ClaimsPauseSet(bool paused);
    event ExhumationsPauseSet(bool paused);

    error ZeroAddress();
    error InvalidPlot();
    error PlotAlreadyRegistered();
    error PlotLimitReached();
    error PlotStageClosed();
    error InvalidPlotCap();
    error InvalidBurnCheckpoint();
    error BurnCheckpointAlreadyUsed();
    error ClaimsPaused();
    error ExhumationsPaused();
    error ClaimExpired();
    error WrongClaimant();
    error InvalidClaim();
    error InvalidIssuer();
    error PlotOccupied();
    error PlotReservedForAnother();
    error WrongPlotEpoch();
    error GraveAlreadyMinted();
    error VoucherAlreadyUsed();
    error NotTokenOwner();

    constructor(address admin, address initialIssuer, address royaltyReceiver)
        ERC721("VibeCemetery Grave", "VGRAVE")
        EIP712("VibeCemetery Grave", "1")
    {
        if (admin == address(0) || initialIssuer == address(0) || royaltyReceiver == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, initialIssuer);
        _setDefaultRoyalty(royaltyReceiver, ROYALTY_BPS);
    }

    /// @dev plotId = keccak256(bytes(exactMapSlotId)); publish the IDs before registering.
    function registerPlots(bytes32[] calldata plotIds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < plotIds.length; ++i) {
            bytes32 plotId = plotIds[i];
            if (plotId == bytes32(0)) revert InvalidPlot();
            if (approvedPlot[plotId]) revert PlotAlreadyRegistered();
            if (plotCount == MAX_PLOTS) revert PlotLimitReached();
            if (plotCount == openPlotCap) revert PlotStageClosed();
            approvedPlot[plotId] = true;
            ++plotCount;
            emit PlotRegistered(plotId);
        }
    }

    /// @notice Open more plot capacity after the cemetery verifies a Base GRAVE burn checkpoint.
    /// @dev The checkpoint is an auditable reference, not an onchain proof of a Base burn.
    /// Use a multisig admin; for trustless gating replace this with verified crosschain messaging.
    function raisePlotCap(uint256 newCap, bytes32 burnCheckpoint) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap <= openPlotCap || newCap > MAX_PLOTS) revert InvalidPlotCap();
        if (burnCheckpoint == bytes32(0)) revert InvalidBurnCheckpoint();
        if (usedBurnCheckpoint[burnCheckpoint]) revert BurnCheckpointAlreadyUsed();
        usedBurnCheckpoint[burnCheckpoint] = true;
        uint256 previousCap = openPlotCap;
        openPlotCap = newCap;
        emit PlotCapRaised(previousCap, newCap, burnCheckpoint);
    }

    /// @notice Claim a real grave after the cemetery has issued its signed voucher.
    /// @dev One grave UUID is usable once; burn/remint on a plot creates a new token ID.
    function claim(Claim calldata voucher, bytes calldata signature) external nonReentrant returns (uint256 tokenId) {
        if (claimsPaused) revert ClaimsPaused();
        if (voucher.wallet != msg.sender) revert WrongClaimant();
        if (block.timestamp > voucher.deadline) revert ClaimExpired();
        if (
            voucher.graveIdHash == bytes32(0) || voucher.metadataHash == bytes32(0)
                || bytes(voucher.uri).length == 0
        ) revert InvalidClaim();
        if (!approvedPlot[voucher.plotId]) revert InvalidPlot();
        if (activeTokenForPlot[voucher.plotId] != 0) revert PlotOccupied();
        if (plotEpoch[voucher.plotId] != voucher.plotEpoch) revert WrongPlotEpoch();
        address reservedFor = reservationHolder[voucher.plotId];
        if (reservedFor != address(0) && reservedFor != msg.sender) revert PlotReservedForAnother();
        if (usedGraveId[voucher.graveIdHash]) revert GraveAlreadyMinted();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CLAIM_TYPEHASH,
                    voucher.wallet,
                    voucher.graveIdHash,
                    voucher.plotId,
                    voucher.plotEpoch,
                    voucher.metadataHash,
                    keccak256(bytes(voucher.uri)),
                    voucher.nonce,
                    voucher.deadline
                )
            )
        );
        if (usedVoucher[digest]) revert VoucherAlreadyUsed();
        if (!hasRole(ISSUER_ROLE, ECDSA.recover(digest, signature))) revert InvalidIssuer();

        usedVoucher[digest] = true;
        usedGraveId[voucher.graveIdHash] = true;
        reservationHolder[voucher.plotId] = address(0);
        tokenId = _nextTokenId++;
        activeTokenForPlot[voucher.plotId] = tokenId;
        graveIdForToken[tokenId] = voucher.graveIdHash;
        plotIdForToken[tokenId] = voucher.plotId;
        metadataHashForToken[tokenId] = voucher.metadataHash;
        _historicalURI[tokenId] = voucher.uri;
        ++activeSupply;

        _safeMint(msg.sender, tokenId);
        emit Claimed(tokenId, voucher.plotId, voucher.graveIdHash, ownerOf(tokenId), voucher.plotEpoch);
    }

    /// @notice Burn a memorial and reserve its plot for the wallet that burns it.
    /// @dev Approvals and marketplace operators cannot exhumate without owning the token.
    function exhume(uint256 tokenId) external nonReentrant {
        if (exhumationsPaused) revert ExhumationsPaused();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        bytes32 plotId = plotIdForToken[tokenId];
        bytes32 graveIdHash = graveIdForToken[tokenId];
        uint64 nextEpoch = plotEpoch[plotId] + 1;

        _burn(tokenId);
        activeTokenForPlot[plotId] = 0;
        reservationHolder[plotId] = msg.sender;
        plotEpoch[plotId] = nextEpoch;
        --activeSupply;
        emit Exhumed(tokenId, plotId, graveIdHash, msg.sender, nextEpoch);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _historicalURI[tokenId];
    }

    /// @notice Metadata remains readable after burn for the archive journal.
    function historicalTokenURI(uint256 tokenId) external view returns (string memory) {
        if (graveIdForToken[tokenId] == bytes32(0)) revert InvalidClaim();
        return _historicalURI[tokenId];
    }

    function setClaimsPaused(bool paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        claimsPaused = paused;
        emit ClaimsPauseSet(paused);
    }

    function setExhumationsPaused(bool paused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        exhumationsPaused = paused;
        emit ExhumationsPauseSet(paused);
    }

    /// @dev Creator earnings are advisory under ERC-2981; marketplace support must be checked.
    function setRoyaltyReceiver(address receiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (receiver == address(0)) revert ZeroAddress();
        _setDefaultRoyalty(receiver, ROYALTY_BPS);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
