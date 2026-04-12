import { SubjectType } from '@k12-ai/shared';

/** A simulation tool definition */
export interface SimulationTool {
  id: string;
  name: string;
  description: string;
  supportedSubjects: SubjectType[];
}

/**
 * STEAMSimulationTool manages a registry of simulation tools
 * that assist cross-subject practice in STEAM activities.
 *
 * Requirements: 24.4
 */
export class STEAMSimulationToolRegistry {
  private tools: SimulationTool[] = [];

  /** Register simulation tools */
  addTools(tools: SimulationTool[]): void {
    this.tools.push(...tools);
  }

  /** Register a single simulation tool */
  addTool(tool: SimulationTool): void {
    this.tools.push(tool);
  }

  /** List all available simulation tools */
  getAvailableTools(): SimulationTool[] {
    return [...this.tools];
  }

  /** Find a tool by id */
  getToolById(id: string): SimulationTool | undefined {
    return this.tools.find((t) => t.id === id);
  }

  /** Find tools that support a given subject */
  getToolsBySubject(subject: SubjectType): SimulationTool[] {
    return this.tools.filter((t) => t.supportedSubjects.includes(subject));
  }
}
