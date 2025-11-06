import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { SeederCommandBuilder } from './components/seeder-command-builder';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    SeederCommandBuilder,
    ...components,
  } as MDXComponents;
}
