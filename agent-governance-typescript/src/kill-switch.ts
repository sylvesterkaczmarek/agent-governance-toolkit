// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { KillSwitchConfig, KillSwitchResult } from './types';

export interface KillContext {
  action?: string;
  reason: string;
}

type KillHandler = (agentId: string, context: KillContext) => void | Promise<void>;

const DEFAULT_CALLBACK_TIMEOUT_MS = 5_000;

export class KillSwitch {
  private readonly enabled: boolean;
  private readonly defaultSubstituteAgentId?: string;
  private readonly callbackTimeoutMs: number;
  private readonly handlers = new Map<string, KillHandler[]>();
  private readonly compensations = new Map<string, KillHandler[]>();
  private readonly substitutes = new Map<string, string>();
  private readonly history: KillSwitchResult[] = [];

  constructor(config: KillSwitchConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.defaultSubstituteAgentId = config.defaultSubstituteAgentId;
    this.callbackTimeoutMs = config.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;
  }

  registerHandler(agentId: string, handler: KillHandler): void {
    const existing = this.handlers.get(agentId) ?? [];
    existing.push(handler);
    this.handlers.set(agentId, existing);
  }

  registerCompensation(agentId: string, handler: KillHandler): void {
    const existing = this.compensations.get(agentId) ?? [];
    existing.push(handler);
    this.compensations.set(agentId, existing);
  }

  registerSubstitute(agentId: string, substituteAgentId: string): void {
    this.substitutes.set(agentId, substituteAgentId);
  }

  getHistory(): KillSwitchResult[] {
    return [...this.history];
  }

  async kill(agentId: string, context: KillContext): Promise<KillSwitchResult> {
    if (!this.enabled) {
      throw new Error('Kill switch is disabled');
    }

    const handlers = this.handlers.get(agentId) ?? [];
    const compensations = this.compensations.get(agentId) ?? [];
    let terminated = handlers.length > 0;

    for (const handler of handlers) {
      const completed = await this.runHandlerWithTimeout(agentId, context, handler);
      if (!completed) {
        terminated = false;
      }
    }

    for (const compensation of compensations) {
      await compensation(agentId, context);
    }

    const handoffAgentId = this.substitutes.get(agentId) ?? this.defaultSubstituteAgentId;
    const result: KillSwitchResult = {
      agentId,
      action: context.action,
      reason: context.reason,
      killedAt: new Date().toISOString(),
      terminated,
      callbacksExecuted: handlers.length,
      compensationsExecuted: compensations.length,
      handoffAgentId,
    };

    this.history.push(result);
    return result;
  }

  private async runHandlerWithTimeout(
    agentId: string,
    context: KillContext,
    handler: KillHandler,
  ): Promise<boolean> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const completion = Promise.resolve(handler(agentId, context)).then(() => true);
    const timeout = new Promise<false>((resolve) => {
      timeoutId = setTimeout(() => resolve(false), this.callbackTimeoutMs);
    });

    try {
      // Arbitrary promises cannot be cancelled in JavaScript. If the timeout
      // wins, kill() stops waiting and leaves the handler promise to settle in
      // the background rather than freezing the containment flow.
      return await Promise.race([completion, timeout]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}
