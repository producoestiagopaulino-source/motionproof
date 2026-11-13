// Safe-zone overlay for Remotion previews. Render it as the last child of a composition and pass `show` from inputProps,
// so it appears in the Studio and never in a final render:  <SafeGuide zone="reels" show={props.safe === true} />
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { safeBox, type ZoneName } from './motionproof';

export const SafeGuide: React.FC<{ zone?: ZoneName; show?: boolean }> = ({ zone = 'reels', show = false }) => {
  const { width, height } = useVideoConfig();
  if (!show) return null;
  const b = safeBox(zone, width, height);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,0,60,0.18)',
        clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${b.top}px, ${b.left}px ${b.top}px, ${b.left}px ${b.bottom}px, ${b.right}px ${b.bottom}px, ${b.right}px ${b.top}px, 0 ${b.top}px)` }} />
      <div style={{ position: 'absolute', left: b.left, top: b.top, width: b.width, height: b.height, border: '3px dashed rgba(255,0,60,0.9)', boxSizing: 'border-box' }} />
    </AbsoluteFill>
  );
};
