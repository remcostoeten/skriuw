import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { Analytics } from '@vercel/analytics/react';

export default function Layout(props: { children: any }) {
  return (
    <DocsLayout tree={source.pageTree} {...baseOptions()}>
      {props.children}
      <Analytics />
    </DocsLayout>
  );
}
