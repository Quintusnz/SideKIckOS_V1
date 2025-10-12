import type { WorkflowDefinition } from "@/models/workflow";

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    id: "workflow-incident-response",
    name: "Incident Response",
    description: "End-to-end runbook that triages production incidents and recommends mitigations.",
    estimatedDuration: "8 minutes",
    steps: [
      { id: "collect-context", label: "Collect Context", description: "Fetch current telemetry and correlated alerts." },
      { id: "summarize-logs", label: "Summarize Logs", description: "Highlight anomalous spans and errors." },
      { id: "draft-response", label: "Draft Response", description: "Prepare engineer-ready playbook." },
    ],
  },
  {
    id: "workflow-knowledge-refresh",
    name: "Knowledge Refresh",
    description: "Imports new documents and curates embeddings for SideKick agents.",
    estimatedDuration: "15 minutes",
    steps: [
      { id: "ingest", label: "Ingest", description: "Download source material." },
      { id: "curate", label: "Curate", description: "Deduplicate and tag important passages." },
      { id: "embed", label: "Embed", description: "Generate embeddings and upload to vector store." },
    ],
  },
  {
    id: "workflow-evals",
    name: "Evaluation Suite",
    description: "Runs nightly evaluation suite across live workflows.",
    estimatedDuration: "22 minutes",
    steps: [
      { id: "setup", label: "Setup", description: "Warm-up orchestration environment." },
      { id: "execute", label: "Execute", description: "Run evaluation batches in parallel." },
      { id: "report", label: "Report", description: "Summarize metrics and regressions." },
    ],
  },
];
