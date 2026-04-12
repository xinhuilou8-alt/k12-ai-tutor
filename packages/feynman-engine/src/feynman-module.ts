import { LLMService } from '@k12-ai/shared';
import { FeynmanSession, FeynmanSessionSummary } from './feynman-session';

/**
 * FeynmanModule is the entry point for the Feynman learning method engine.
 * It manages multiple concurrent sessions and acts as the recommended
 * deep-learning step after basic exercises.
 */
export class FeynmanModule {
  private llmService: LLMService;
  private sessions = new Map<string, FeynmanSession>();
  private childGrades = new Map<string, number>();

  constructor(llmService: LLMService) {
    this.llmService = llmService;
  }

  /**
   * Register a child's grade so sessions can adapt language complexity.
   */
  registerChild(childId: string, grade: number): void {
    this.childGrades.set(childId, grade);
  }

  /**
   * Start a new Feynman session for a child on a specific knowledge point.
   * Returns the session and the initial invitation message.
   */
  startSession(
    childId: string,
    knowledgePointId: string,
  ): { session: FeynmanSession; invitation: string } {
    const grade = this.childGrades.get(childId) ?? 4;
    const sessionKey = `${childId}::${knowledgePointId}`;

    const session = new FeynmanSession(
      childId,
      knowledgePointId,
      grade,
      this.llmService,
    );

    const invitation = session.startSession();
    this.sessions.set(sessionKey, session);

    return { session, invitation };
  }

  /**
   * Retrieve an active session by child and knowledge point.
   */
  getSession(childId: string, knowledgePointId: string): FeynmanSession | undefined {
    return this.sessions.get(`${childId}::${knowledgePointId}`);
  }

  /**
   * End a session and remove it from the active map.
   * Returns the session summary for learning profile updates.
   */
  endSession(childId: string, knowledgePointId: string): FeynmanSessionSummary | null {
    const key = `${childId}::${knowledgePointId}`;
    const session = this.sessions.get(key);
    if (!session) return null;

    const summary = session.endSession();
    this.sessions.delete(key);
    return summary;
  }

  /**
   * Check whether a Feynman session is recommended for a child
   * after completing basic exercises on a knowledge point.
   * Recommended when mastery is moderate (not too low, not already deep).
   */
  shouldRecommend(currentMastery: number): boolean {
    return currentMastery >= 40 && currentMastery < 85;
  }

  /**
   * Get all active session keys.
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
