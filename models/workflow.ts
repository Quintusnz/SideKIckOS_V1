export type WorkflowStepDef = {
  id: string;
  label: string;
  description: string;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  estimatedDuration: string;
  steps: WorkflowStepDef[];
};
