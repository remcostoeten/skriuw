'use client'

import type { PreviewProps } from "../types";
import { Search, FileText } from "lucide-react";
import React from "react";

export default function SearchPreview({ value }: PreviewProps<boolean>) {
	return (
		<div className='mt-3 rounded-md overflow-hidden border border-border bg-background-secondary'>
			<div className='p-3 border-b border-border bg-background'>
				<div className='relative'>
					<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
					<div className='w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm flex items-center text-foreground'>
						project
					</div>
				</div>
			</div>
			<div className='p-2 space-y-1'>
				<div className='flex items-center gap-2 p-2 rounded-md hover:bg-muted/50'>
					<FileText className='w-4 h-4 text-primary' />
					<div className='flex-1 min-w-0'>
						<div className='text-sm font-medium text-foreground'>
							<span className='bg-yellow-500/20 text-yellow-500'>Project</span>{' '}
							Plan.md
						</div>
						<div className='text-xs text-muted-foreground truncate'>
							Overview of the upcoming timeline
						</div>
					</div>
				</div>

				<div
					className={`flex items-center gap-2 p-2 rounded-md transition-opacity duration-200 ${value ? 'opacity-100' : 'opacity-30 grayscale'}`}
				>
					<FileText className='w-4 h-4 text-muted-foreground' />
					<div className='flex-1 min-w-0'>
						<div className='text-sm font-medium text-foreground'>Meeting Notes.md</div>
						<div className='text-xs text-muted-foreground truncate'>
							...discuss the{' '}
							<span className={value ? 'bg-yellow-500/20 text-yellow-500' : ''}>
								project
							</span>{' '}
							timeline...
						</div>
					</div>
					{!value && (
						<div className='text-[10px] font-medium text-muted-foreground border border-border px-1.5 py-0.5 rounded'>
							Hidden
						</div>
					)}
				</div>
			</div>
			<div className='px-3 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground'>
				{value
					? 'Searching in both file names and content.'
					: 'Searching in file names only.'}
			</div>
		</div>
	)
}
