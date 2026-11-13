import {Component, type ReactNode} from 'react';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Button} from '@astryxdesign/core/Button';

/** 화면 하나가 오류로 멈춰도 앱 전체가 하얗게 되지 않게: 안내와 다시 시도 버튼 */
export class ErrorBoundary extends Component<{children: ReactNode; resetKey?: string; title?: string}, {err: Error | null; key?: string}> {
  state = {err: null as Error | null, key: this.props.resetKey};
  static getDerivedStateFromError(err: Error) { return {err}; }
  static getDerivedStateFromProps(p: {resetKey?: string}, s: {err: Error | null; key?: string}) {
    return p.resetKey !== s.key ? {err: null, key: p.resetKey} : null; // 다른 화면으로 옮기면 오류 상태 해제
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" style={{padding: this.props.title ? 12 : 32}}>
        <EmptyState headingLevel={2} title={this.props.title || '이 화면을 표시하는 중 문제가 생겼습니다.'} description="데이터는 그대로입니다. 다시 시도하거나 페이지를 새로고침해 주세요."
          actions={<Button label="다시 시도" variant="secondary" onClick={() => this.setState({err: null})} />} />
      </div>
    );
  }
}
