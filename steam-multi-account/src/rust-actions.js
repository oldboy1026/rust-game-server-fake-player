import { ApiError } from './errors.js';

export const RUST_ACTIONS = Object.freeze(['wake', 'respawn', 'suicide', 'stop', 'forward', 'backward', 'left', 'right', 'jump']);
export const ACTION_STATUSES = Object.freeze(['started', 'sent', 'stopped', 'not_ready', 'stale_state',
  'unsupported_state', 'busy', 'rate_limited', 'send_failed', 'interrupted', 'snapshot_observed', 'unconfirmed']);

export function validateRustAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !['action', 'flatGround', 'confirmDeath'].includes(key))
      || !RUST_ACTIONS.includes(input.action)
      || (Object.hasOwn(input, 'flatGround') && typeof input.flatGround !== 'boolean')
      || (Object.hasOwn(input, 'confirmDeath') && typeof input.confirmDeath !== 'boolean')
      || (input.action === 'suicide' && input.confirmDeath !== true)
      || (['forward', 'backward', 'left', 'right', 'jump'].includes(input.action) && input.flatGround !== true)) {
    throw new ApiError(400, '需要固定的角色动作；短步和跳跃还需要确认平坦、无遮挡的测试地面。');
  }
  return { action: input.action, flatGround: input.flatGround === true, ...(input.action === 'suicide' ? { confirmDeath: true } : {}) };
}
