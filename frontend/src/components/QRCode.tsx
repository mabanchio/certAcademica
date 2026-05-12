"use client";

import { QRCodeSVG } from "qrcode.react";

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  label?: string;
}

export function QRCodeDisplay({ value, size = 180, label }: QRCodeDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
        <QRCodeSVG
          value={value}
          size={size}
          bgColor="#ffffff"
          fgColor="#0A2540"
          level="Q"
          imageSettings={{
            src: "/favicon.svg",
            height: 28,
            width: 28,
            excavate: true,
          }}
        />
      </div>
      {label && (
        <p className="text-xs text-gray-500 text-center max-w-[200px] break-all">{label}</p>
      )}
    </div>
  );
}
