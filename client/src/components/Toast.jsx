import React, { useEffect } from 'react';
import { useEditor } from '../store/editor.js';

export default function Toast() {
  const toast = useEditor((s) => s.toast);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => useEditor.setState({ toast: null }), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" onClick={() => useEditor.setState({ toast: null })}>
      {toast.msg}
    </div>
  );
}
