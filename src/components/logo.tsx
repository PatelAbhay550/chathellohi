import type { SVGProps } from 'react';
import React from 'react';
import Link from 'next/link';

// className in LogoProps will be applied to the SVG if isText is false,
// or to the Link/span if isText is true.
interface LogoProps extends SVGProps<SVGSVGElement> {
  isText?: boolean;
  disableLink?: boolean;
}

const Logo = ({ className, isText = false, disableLink = false, ...props }: LogoProps) => {
  if (isText) {
    const textContent = "Hellohi";
    // For text mode, the className prop is applied to the wrapper (Link or span)
    // along with the default text styling.
    const effectiveClasses = `text-2xl font-bold text-primary ${className || ''}`.trim();

    if (disableLink) {
      // {...props} might contain SVG specific attributes if not filtered,
      // but for a span, only standard HTML attributes are relevant.
      // For simplicity, we assume props are not critical here or are filtered by React.
      return <span className={effectiveClasses}>{textContent}</span>;
    }
    return (
      // Pass relevant props for an anchor tag
      <Link href="/" className={effectiveClasses} {...(props as Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'>)}>
        {textContent}
      </Link>
    );
  }

  // SVG mode
  const svgElement = (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className} // className is for the SVG itself
      {...props} // other SVG props from SVGProps<SVGSVGElement>
    >
      <circle cx="20" cy="20" r="18" fill="hsl(var(--primary))" />
      <path
        d="M12 18C12 16.8954 12.8954 16 14 16H18C19.1046 16 20 16.8954 20 18V22C20 23.1046 19.1046 24 18 24H14C12.8954 24 12 23.1046 12 22V18Z"
        fill="hsl(var(--primary-foreground))"
      />
      <path
        d="M22 18C22 16.8954 22.8954 16 24 16H28C29.1046 16 30 16.8954 30 18V22C30 23.1046 29.1046 24 28 24H24C22.8954 24 22 23.1046 22 22V18Z"
        fill="hsl(var(--primary-foreground))"
        opacity="0.7"
      />
    </svg>
  );

  if (disableLink) {
    return svgElement;
  }

  return (
    <Link href="/" aria-label="Hellohi Home">
      {svgElement}
    </Link>
  );
};

export default Logo;
