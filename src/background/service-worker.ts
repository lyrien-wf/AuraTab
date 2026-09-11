/**
 * 后台 Service Worker（文档 6.3）：
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

const events = [
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onRemoved,
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onMoved,
  chrome.bookmarks.onChildrenReordered,
  chrome.bookmarks.onImportEnded,
];

for (const event of events) {
  event.addListener(notifyDirty);
}
