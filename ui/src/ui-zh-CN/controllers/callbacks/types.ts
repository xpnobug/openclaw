/**
 * 回调工厂公共类型
 * Common types for callback factories
 */

/** 回调工厂上下文 - state 使用 any 避免循环依赖 */
export type CallbackContext = {
  /** 内部状态对象（InternalState） */
  s: any;
  /** 触发 LitElement requestUpdate */
  update: () => void;
};
