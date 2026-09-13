import { Component } from "react";
import { isChunkLoadError, recoverFromChunkLoadFailure } from "../../lib/chunkLoadRecovery";

/**
 * Catches React.lazy / dynamic import failures that surface as render errors.
 * Recovery (reload-once or Arabic fallback) is handled by chunkLoadRecovery.
 */
export default class ChunkLoadErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { chunkFailed: false };
  }

  static getDerivedStateFromError(error) {
    if (isChunkLoadError(error)) {
      return { chunkFailed: true };
    }
    return null;
  }

  componentDidCatch(error) {
    if (isChunkLoadError(error)) {
      recoverFromChunkLoadFailure();
    }
  }

  render() {
    if (this.state.chunkFailed) {
      // DOM fallback is injected by recoverFromChunkLoadFailure when not reloading.
      return null;
    }
    return this.props.children;
  }
}
