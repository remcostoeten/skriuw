import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout(props: { children: any }) {
  return <HomeLayout {...baseOptions()}>{props.children}</HomeLayout>;
}
