/** Generated from @flarenetwork/flare-periphery-contract-artifacts@0.1.52 (coston2)
 *  and the MachineManager bindings in @flare-foundation/go-flare-common. */
export const assetManagerAbi = [
  {
    "inputs": [],
    "name": "directMintingPaymentAddress",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getDirectMintingFeeBIPS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getDirectMintingMinimumFeeUBA",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getDirectMintingExecutorFeeUBA",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minimumRedeemAmountUBA",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "fAsset",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const contractRegistryAbi = [
  {
    "inputs": [
      {
        "internalType": "string[]",
        "name": "_names",
        "type": "string[]"
      }
    ],
    "name": "getContractAddressesByName",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const ftsoV2Abi = [
  {
    "inputs": [
      {
        "internalType": "bytes21",
        "name": "_feedId",
        "type": "bytes21"
      }
    ],
    "name": "getFeedById",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "_value",
        "type": "uint256"
      },
      {
        "internalType": "int8",
        "name": "_decimals",
        "type": "int8"
      },
      {
        "internalType": "uint64",
        "name": "_timestamp",
        "type": "uint64"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes21",
        "name": "_feedId",
        "type": "bytes21"
      }
    ],
    "name": "getFeedByIdInWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "_value",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "_timestamp",
        "type": "uint64"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes21",
        "name": "_feedId",
        "type": "bytes21"
      }
    ],
    "name": "calculateFeeById",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "_fee",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const machineManagerAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_teeId",
        "type": "address"
      }
    ],
    "name": "getTeeMachineStatus",
    "outputs": [
      {
        "internalType": "enumIMachineManager.TeeStatus",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_teeId",
        "type": "address"
      }
    ],
    "name": "getExtensionId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_teeId",
        "type": "address"
      }
    ],
    "name": "getTeeMachine",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "teeId",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "teeProxyId",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "url",
            "type": "string"
          }
        ],
        "internalType": "structIMachineManager.TeeMachine",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_extensionId",
        "type": "uint256"
      }
    ],
    "name": "getActiveTeeMachines",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "_teeIds",
        "type": "address[]"
      },
      {
        "internalType": "string[]",
        "name": "_urls",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_teeId",
        "type": "address"
      }
    ],
    "name": "getLastStatusChangeTs",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_teeId",
        "type": "address"
      }
    ],
    "name": "getPublicKey",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "x",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "y",
            "type": "bytes32"
          }
        ],
        "internalType": "structPublicKey",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
