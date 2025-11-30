import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

import { Checkbox } from '@/shared/primitives/checkbox'

import type { BlockNoteEditor } from '@blocknote/core'

interface TaskCheckboxReplacerProps {
    editor: BlockNoteEditor | null
    editorContainerRef: React.RefObject<HTMLDivElement>
}

interface ReplacedCheckbox {
    root: ReturnType<typeof createRoot>
    defaultCheckbox: HTMLInputElement
    listItem: HTMLElement
    blockId: string | null
}

/**
 * Component that replaces BlockNote's default task checkboxes with our custom Checkbox component
 * This runs as a side effect that watches for task list items and replaces their checkboxes
 */
export function TaskCheckboxReplacer({ editor, editorContainerRef }: TaskCheckboxReplacerProps) {
    const replacedCheckboxesRef = useRef<Map<HTMLInputElement, ReplacedCheckbox>>(new Map())

    useEffect(() => {
        if (!editor || !editorContainerRef.current) return

        const replaceTaskCheckboxes = () => {
            if (!editorContainerRef.current) return

            // Find all bullet list items that are tasks (have a checkbox)
            // BlockNote uses data-content-type="bulletListItem" for list items
            // Tasks have a checkbox input inside them
            const taskListItems = editorContainerRef.current.querySelectorAll(
                '[data-content-type="bulletListItem"]'
            )

            taskListItems.forEach((listItem) => {
                // Check if this list item has a checkbox (making it a task)
                const defaultCheckbox = listItem.querySelector('input[type="checkbox"]') as HTMLInputElement
                
                if (!defaultCheckbox) return

                // Skip if we've already replaced this checkbox
                if (replacedCheckboxesRef.current.has(defaultCheckbox)) {
                    // Update the checked state if it changed
                    const existing = replacedCheckboxesRef.current.get(defaultCheckbox)!
                    const currentChecked = defaultCheckbox.checked
                    // Re-render with updated state
                    existing.root.render(
                        <Checkbox
                            checked={currentChecked}
                            size="sm"
                            variant="default"
                            onChange={(checked) => {
                                // Use BlockNote's API to toggle the task
                                if (existing.blockId) {
                                    const block = editor.getBlock(existing.blockId)
                                    if (block && block.type === 'bulletListItem') {
                                        editor.updateBlock(block, {
                                            props: {
                                                ...block.props,
                                                checked: checked
                                            }
                                        })
                                    }
                                } else {
                                    // Fallback: click the default checkbox
                                    defaultCheckbox.checked = checked
                                    defaultCheckbox.click()
                                }
                            }}
                        />
                    )
                    return
                }

                // Get the block ID from the list item's data attribute
                const blockId = listItem.getAttribute('data-node-id') || 
                               listItem.closest('[data-node-id]')?.getAttribute('data-node-id') ||
                               null

                // Get the checked state
                const isChecked = defaultCheckbox.checked

                // Hide the default checkbox but keep it in the DOM for BlockNote's state management
                defaultCheckbox.style.position = 'absolute'
                defaultCheckbox.style.opacity = '0'
                defaultCheckbox.style.width = '0'
                defaultCheckbox.style.height = '0'
                defaultCheckbox.style.pointerEvents = 'none'
                defaultCheckbox.style.margin = '0'
                defaultCheckbox.style.padding = '0'

                // Create a container for our custom checkbox
                const checkboxContainer = document.createElement('div')
                checkboxContainer.className = 'bn-custom-checkbox-container'
                checkboxContainer.style.display = 'inline-flex'
                checkboxContainer.style.alignItems = 'center'
                checkboxContainer.style.marginRight = '0.5rem'
                checkboxContainer.style.verticalAlign = 'middle'
                checkboxContainer.style.flexShrink = '0'

                // Insert our custom checkbox before the default one or at the start of the list item
                const listItemContent = listItem.querySelector('.bn-inline-content') || 
                                      listItem.querySelector('[contenteditable]') ||
                                      listItem.firstChild
                
                if (listItemContent && listItemContent.parentNode) {
                    listItemContent.parentNode.insertBefore(checkboxContainer, listItemContent)
                } else {
                    listItem.insertBefore(checkboxContainer, listItem.firstChild)
                }

                // Create React root and render our custom Checkbox
                const root = createRoot(checkboxContainer)
                root.render(
                    <Checkbox
                        checked={isChecked}
                        size="sm"
                        variant="default"
                        onChange={(checked) => {
                            // Use BlockNote's API to toggle the task
                            if (blockId) {
                                try {
                                    const block = editor.getBlock(blockId)
                                    if (block && block.type === 'bulletListItem') {
                                        editor.updateBlock(block, {
                                            props: {
                                                ...block.props,
                                                checked: checked
                                            }
                                        })
                                    }
                                } catch (error) {
                                    console.warn('Failed to update block via API, using fallback:', error)
                                    // Fallback: update checkbox and trigger change
                                    defaultCheckbox.checked = checked
                                    const event = new Event('change', { bubbles: true })
                                    defaultCheckbox.dispatchEvent(event)
                                }
                            } else {
                                // Fallback: update checkbox and trigger change
                                defaultCheckbox.checked = checked
                                const event = new Event('change', { bubbles: true })
                                defaultCheckbox.dispatchEvent(event)
                            }
                        }}
                    />
                )

                // Track that we've replaced this checkbox
                replacedCheckboxesRef.current.set(defaultCheckbox, {
                    root,
                    defaultCheckbox,
                    listItem,
                    blockId
                })
            })
        }

        // Initial replacement
        replaceTaskCheckboxes()

        let isReplacing = false
        let debounceTimeout: NodeJS.Timeout | null = null

        // Debounced replacement function to prevent infinite loops
        const debouncedReplace = () => {
            if (isReplacing) return
            
            if (debounceTimeout) {
                clearTimeout(debounceTimeout)
            }
            
            debounceTimeout = setTimeout(() => {
                isReplacing = true
                try {
                    replaceTaskCheckboxes()
                } finally {
                    isReplacing = false
                }
            }, 100)
        }

        // Watch for new task items being added
        // Only watch for list items being added, not all changes
        const observer = new MutationObserver((mutations) => {
            // Check if any mutation involves list items
            const hasListItemChange = mutations.some((mutation) => {
                if (mutation.type === 'childList') {
                    // Check added nodes
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as Element
                            if (
                                element.matches?.('[data-content-type="bulletListItem"]') ||
                                element.querySelector?.('[data-content-type="bulletListItem"]')
                            ) {
                                return true
                            }
                        }
                    }
                    // Check if mutation target is a list item
                    if (mutation.target.nodeType === Node.ELEMENT_NODE) {
                        const target = mutation.target as Element
                        if (target.matches?.('[data-content-type="bulletListItem"]')) {
                            return true
                        }
                    }
                }
                return false
            })

            if (hasListItemChange) {
                debouncedReplace()
            }
        })

        if (editorContainerRef.current) {
            observer.observe(editorContainerRef.current, {
                childList: true,
                subtree: true
            })
        }

        // Also listen to editor changes to update checkbox states
        const unsubscribe = editor.onChange(() => {
            // Small delay to ensure DOM is updated, but use debounced version
            debouncedReplace()
        })

        return () => {
            observer.disconnect()
            unsubscribe()
            if (debounceTimeout) {
                clearTimeout(debounceTimeout)
            }
            // Cleanup: unmount all React roots
            replacedCheckboxesRef.current.forEach(({ root }) => {
                try {
                    root.unmount()
                } catch (error) {
                    // Ignore unmount errors
                }
            })
            replacedCheckboxesRef.current.clear()
        }
    }, [editor, editorContainerRef])

    return null // This component doesn't render anything
}

