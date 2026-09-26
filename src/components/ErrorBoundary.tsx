import { Component, type ErrorInfo, type ReactNode } from 'react';

// Shows a message instead of a blank page when a page crashes. Keyed by the page's
// address where it's used, so moving to another page tries again.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <div className='d-flex flex-col gap-2 my-1 mx-4'>
      <h1 className='mb-0'>Something went wrong</h1>
      <p className='ma-0'>This page ran into a problem it couldn't recover from. Reloading may help; if it keeps happening, the details are in the browser's console.</p>
      <div className='d-flex gap-3 flex-wrap align-center'>
        <button onClick={() => window.location.reload()}>Reload</button>
        <a className='link link-animated' href='/'>Back to your campaigns</a>
      </div>
    </div>;
  }
}
