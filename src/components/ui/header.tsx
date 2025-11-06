import React from 'react';
import { Button } from './button';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function Header({
  title,
  subtitle,
  actions,
  className = ''
}: HeaderProps) {
  return (
    <header
      className={`items-center border-b flex justify-between absolute w-full h-9 top-0 bg-white border-gray-200 pt-0 pr-[6px] pb-0 pl-20 z-[40] ${className}`}
    >
      <div className="flex items-center gap-4">
        {title && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            {subtitle && (
              <p className="text-sm text-gray-500">{subtitle}</p>
            )}
          </div>
        )}
      </div>

      {!title && (
        <p
          className="outline-solid pointer-events-none mr-[-159px] text-[rgba(3,_7,_18,_0.85)]/85 text-[14px] leading-[20px] outline-black/0 outline-offset-[2px] outline-[2px]"
          style={{ textDecoration: 'none solid rgba(3, 7, 18, 0.85)' }}
        >
          {/* Empty paragraph from original design */}
        </p>
      )}

      <div className="flex gap-[4px]">
        {actions || (
          <>
            <Button
              href="https://go.haptic.md/github"
              variant="static"
              size="static"
            >
              Star on Github
            </Button>
            <Button
              href="https://go.haptic.md/download"
              variant="primary"
              size="static"
            >
              Download
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
