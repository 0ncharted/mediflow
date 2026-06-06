export const PATIENT_REGISTRY_ADDRESS = (
  import.meta.env.VITE_PATIENT_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const HEALTH_QUERY_ENGINE_ADDRESS = (
  import.meta.env.VITE_HEALTH_QUERY_ENGINE_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const INSURANCE_MODULE_ADDRESS = (
  import.meta.env.VITE_INSURANCE_MODULE_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const RESEARCH_REGISTRY_ADDRESS = (
  import.meta.env.VITE_RESEARCH_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const CONTRACTS_DEPLOYED =
  PATIENT_REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const PATIENT_REGISTRY_ABI = [
  {
    name: "registerPatient",
    type: "function",
    inputs: [
      { name: "_riskScore", type: "bytes32" },
      { name: "_riskProof", type: "bytes" },
      { name: "_conditionFlags", type: "bytes32" },
      { name: "_flagsProof", type: "bytes" },
      { name: "_age", type: "bytes32" },
      { name: "_ageProof", type: "bytes" },
      { name: "_medCount", type: "bytes32" },
      { name: "_medProof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "isEnrolled",
    type: "function",
    inputs: [{ name: "patient", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "getPatientRecord",
    type: "function",
    inputs: [{ name: "patient", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "riskScore", type: "bytes32" },
          { name: "conditionFlags", type: "bytes32" },
          { name: "age", type: "bytes32" },
          { name: "medCount", type: "bytes32" },
          { name: "enrolled", type: "bool" },
          { name: "lastUpdated", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    name: "authorizeProvider",
    type: "function",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "checkRiskScoreACL",
    type: "function",
    inputs: [
      { name: "patient", type: "address" },
      { name: "grantee", type: "address" },
    ],
    outputs: [
      { name: "contractHasACL", type: "bool" },
      { name: "granteeHasACL", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    name: "providerAuthorized",
    type: "function",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "PatientRegistered",
    type: "event",
    inputs: [
      { indexed: true, name: "patient", type: "address" },
      { indexed: true, name: "timestamp", type: "uint256" },
    ],
  },
  {
    name: "grantDelegatedFieldAccess",
    type: "function",
    inputs: [
      { name: "grantee", type: "address" },
      { name: "fieldIndex", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "ProviderAuthorized",
    type: "event",
    inputs: [
      { indexed: true, name: "patient", type: "address" },
      { indexed: true, name: "provider", type: "address" },
    ],
  },
  {
    name: "FieldAccessDelegated",
    type: "event",
    inputs: [
      { indexed: true, name: "patient", type: "address" },
      { indexed: true, name: "grantee", type: "address" },
      { indexed: false, name: "fieldIndex", type: "uint8" },
    ],
  },
] as const;

export const HEALTH_QUERY_ENGINE_ABI = [
  {
    name: "runEligibilityCheck",
    type: "function",
    inputs: [
      { name: "patient", type: "address" },
      { name: "maxRiskThreshold", type: "uint64" },
    ],
    outputs: [{ name: "checkId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    name: "getEligibilityResult",
    type: "function",
    inputs: [{ name: "checkId", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    name: "checkExists",
    type: "function",
    inputs: [{ name: "checkId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "runAggregateQuery",
    type: "function",
    inputs: [
      { name: "cohort", type: "address[]" },
      { name: "queryType", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    name: "EligibilityChecked",
    type: "event",
    inputs: [
      { indexed: true, name: "patient", type: "address" },
      { indexed: true, name: "provider", type: "address" },
      { indexed: true, name: "checkId", type: "bytes32" },
    ],
  },
  {
    name: "AggregateQueryCompleted",
    type: "event",
    inputs: [
      { indexed: true, name: "institution", type: "address" },
      { indexed: false, name: "queryType", type: "uint8" },
      { indexed: false, name: "cohortSize", type: "uint256" },
    ],
  },
] as const;

export const INSURANCE_MODULE_ABI = [
  {
    name: "createPolicy",
    type: "function",
    inputs: [
      { name: "patient", type: "address" },
      { name: "premium", type: "uint256" },
      { name: "coverage", type: "uint256" },
      { name: "riskThreshold", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "processClaimPayment",
    type: "function",
    inputs: [
      { name: "patient", type: "address" },
      { name: "eligibilityCheckId", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getPolicy",
    type: "function",
    inputs: [{ name: "patient", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "monthlyPremium", type: "uint256" },
          { name: "coverageAmount", type: "uint256" },
          { name: "riskThreshold", type: "uint64" },
          { name: "active", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    name: "isClaimProcessed",
    type: "function",
    inputs: [{ name: "checkId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "ClaimProcessed",
    type: "event",
    inputs: [
      { indexed: true, name: "patient", type: "address" },
      { indexed: true, name: "checkId", type: "bytes32" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    name: "PolicyCreated",
    type: "event",
    inputs: [
      { indexed: true, name: "patient", type: "address" },
      { indexed: false, name: "premium", type: "uint256" },
      { indexed: false, name: "coverage", type: "uint256" },
    ],
  },
] as const;

export const RESEARCH_REGISTRY_ABI = [
  {
    name: "approveInstitution",
    type: "function",
    inputs: [
      { name: "institution", type: "address" },
      { name: "name", type: "string" },
      { name: "purpose", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "registerCohort",
    type: "function",
    inputs: [
      { name: "institution", type: "address" },
      { name: "cohortId", type: "bytes32" },
      { name: "patients", type: "address[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "institutions",
    type: "function",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "purpose", type: "string" },
      { name: "approved", type: "bool" },
      { name: "queryCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    name: "isApproved",
    type: "function",
    inputs: [{ name: "institution", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "getCohortCount",
    type: "function",
    inputs: [{ name: "institution", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "InstitutionApproved",
    type: "event",
    inputs: [
      { indexed: true, name: "institution", type: "address" },
      { indexed: false, name: "name", type: "string" },
    ],
  },
  {
    name: "CohortRegistered",
    type: "event",
    inputs: [
      { indexed: true, name: "cohortId", type: "bytes32" },
      { indexed: false, name: "patientCount", type: "uint256" },
    ],
  },
] as const;
