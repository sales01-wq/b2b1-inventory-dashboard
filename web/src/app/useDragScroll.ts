import {useEffect, type RefObject} from 'react';

// 이 위에서 누르면 드래그 스크롤을 시작하지 않음: 입력 · 버튼 · 체크 · 열 너비 조절 손잡이
const SKIP = 'input,button,a,select,textarea,label,[role="button"],[role="checkbox"],[contenteditable],.col-resize-handle';

/**
 * 옆으로 넘치는 표를 마우스로 잡고 끌어 스크롤 (기존 index.html 3080행의 전역 드래그 스크롤과 같은 방식).
 * - 6px 이상 움직여야 시작하므로 그냥 누르기(행 선택)는 그대로 클릭으로 동작하고, 끌었을 때만 그 클릭을 막음.
 * - port: 가로로 넘치는 영역만 · 세로로 더 많이 움직이면 시작하지 않음(글자 선택) · Alt 를 누르고 끌면 글자 선택.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let st: {el: HTMLElement; x: number; y: number; left: number; moved: boolean} | null = null;
    let suppress = false;
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (e.button !== 0 || e.altKey || e.detail > 1 || t.closest(SKIP)) return;
      for (let el: HTMLElement | null = t; el && root.contains(el); el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) {
          st = {el, x: e.clientX, y: e.clientY, left: el.scrollLeft, moved: false};
          return;
        }
      }
    };
    const move = (e: MouseEvent) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { st = null; return; } // 세로로 끌면 글자 선택 · 페이지 스크롤에 맡김
        st.moved = true;
        st.el.classList.add('drag-scrolling');
        window.getSelection()?.removeAllRanges();
      }
      st.el.scrollLeft = st.left - dx;
      e.preventDefault();
    };
    const up = () => {
      if (!st) return;
      if (st.moved) { suppress = true; setTimeout(() => { suppress = false; }, 0); }
      st.el.classList.remove('drag-scrolling');
      st = null;
    };
    const click = (e: MouseEvent) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } };
    root.addEventListener('mousedown', down);
    root.addEventListener('click', click, true);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      root.removeEventListener('mousedown', down);
      root.removeEventListener('click', click, true);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [ref]);
}
