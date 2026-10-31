/**
 * 后台 Service Worker：
 * 监听全部书签变更事件，300ms 防抖后广播 BOOKMARKS_DIRTY，
 * 新标签页收到后重新 loadModel 并保留当前选中目录。
 */
import { BOOKMARKS_DIRTY } from '../core/types';

let timer: ReturnType<typeof setTimeout> | undefined;

function notifyDirty(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    // 回调式 sendMessage：无接收页面时错误落在 lastError，读取即吞掉，避免未处理拒绝
    chrome.runtime.sendMessage({ type: BOOKMARKS_DIRTY }, () => void chrome.runtime.lastError);
  }, 300);
}

/* 逐个防御注册：任一事件 API 缺失（内核裁剪 / API 变更）只跳过该事件并告警，
   不再让整段脚本抛错导致后台彻底失效（P2-8） */
interface ListenableEvent {
  addListener(cb: () => void): void;
}

const events: [string, ListenableEvent | undefined][] = [
  ['onCreated', chrome.bookmarks?.onCreated],
  ['onRemoved', chrome.bookmarks?.onRemoved],
  ['onChanged', chrome.bookmarks?.onChanged],
  ['onMoved', chrome.bookmarks?.onMoved],
  ['onChildrenReordered', chrome.bookmarks?.onChildrenReordered],
  ['onImportEnded', chrome.bookmarks?.onImportEnded],
];

for (const [name, event] of events) {
  if (event?.addListener) {
    event.addListener(notifyDirty);
  } else {
    console.warn(`[AuraTab] chrome.bookmarks.${name} 不可用，已跳过该事件的实时同步监听`);
  }
}
