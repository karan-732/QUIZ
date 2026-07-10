import { QRCodeSVG } from 'qrcode.react';

export default function QRCodeCard({ joinUrl }) {
  return (
    <div className="glass flex flex-col items-center gap-4 rounded-3xl p-5">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Scan to join</p>
      {/* QR needs a white quiet zone to scan reliably from across a room.
          No glow/blur here — modules must stay pixel-crisp to scan. */}
      <div className="rounded-2xl bg-white p-3">
        <QRCodeSVG
          value={joinUrl}
          size={176}
          level="M"
          shapeRendering="crispEdges"
          style={{ display: 'block' }}
        />
      </div>
      <p className="max-w-52 break-all text-center text-xs font-medium text-slate-400">{joinUrl}</p>
    </div>
  );
}
