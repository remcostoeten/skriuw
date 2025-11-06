import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout(props: { children: any }) {
  return (
    <DocsLayout tree={source.pageTree} {...baseOptions()}>
      {props.children}
    </DocsLayout>
  );
}
