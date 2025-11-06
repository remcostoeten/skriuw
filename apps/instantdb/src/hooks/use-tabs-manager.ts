"use client";

import { useState, useCallback, useEffect } from 'react';
import type { Note } from '@/api/db/schema';

export interface Tab {
  id: string;
  noteId: string;
  title: string;
  isActive: boolean;
  position: number;
}

const STORAGE_KEY = 'app-tabs-state';

interface UseTabsManagerOptions {
  maxTabs?: number;
  defaultTabTitle?: string;
}

export function useTabsManager(
  notes: Note[],
  options: UseTabsManagerOptions = {}
) {
  const { maxTabs = 10, defaultTabTitle = 'Untitled' } = options;

  // Load tabs from localStorage on mount
  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedTabs = JSON.parse(stored);
        // Validate and sanitize stored tabs
        return parsedTabs.filter((tab: Tab) =>
          tab.id &&
          tab.noteId &&
          typeof tab.position === 'number' &&
          !isNaN(tab.position)
        );
      }
    } catch (error) {
      console.warn('Failed to load tabs from localStorage:', error);
    }
    return [];
  });

  // Save tabs to localStorage whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch (error) {
      console.warn('Failed to save tabs to localStorage:', error);
    }
  }, [tabs]);

  // Update tab titles when note titles change
  useEffect(() => {
    setTabs(prevTabs =>
      prevTabs.map(tab => {
        const note = notes.find(n => n.id === tab.noteId);
        return {
          ...tab,
          title: note?.title || defaultTabTitle
        };
      })
    );
  }, [notes, defaultTabTitle]);

  const createNewTab = useCallback((noteId: string, title?: string) => {
    const note = notes.find(n => n.id === noteId);
    const tabTitle = title || note?.title || defaultTabTitle;

    const newTab: Tab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      noteId,
      title: tabTitle,
      isActive: true,
      position: tabs.length
    };

    setTabs(prevTabs => {
      // Deactivate all tabs
      const deactivatedTabs = prevTabs.map(tab => ({ ...tab, isActive: false }));

      // Check if we've reached max tabs
      if (deactivatedTabs.length >= maxTabs) {
        // Remove the oldest inactive tab
        const oldestInactiveIndex = deactivatedTabs.findIndex(tab => !tab.isActive);
        if (oldestInactiveIndex !== -1) {
          deactivatedTabs.splice(oldestInactiveIndex, 1);
        }
      }

      return [...deactivatedTabs, newTab];
    });

    return newTab.id;
  }, [tabs.length, notes, maxTabs, defaultTabTitle]);

  const selectTab = useCallback((tabId: string) => {
    setTabs(prevTabs =>
      prevTabs.map(tab => ({
        ...tab,
        isActive: tab.id === tabId
      }))
    );
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tabToClose = prevTabs.find(tab => tab.id === tabId);
      if (!tabToClose) return prevTabs;

      // If closing the active tab, activate another one
      let newTabs = prevTabs.filter(tab => tab.id !== tabId);

      if (tabToClose.isActive && newTabs.length > 0) {
        // Find the tab to activate (previous tab, or first tab)
        const currentIndex = prevTabs.findIndex(tab => tab.id === tabId);
        const nextTab = newTabs[currentIndex - 1] || newTabs[0];

        newTabs = newTabs.map(tab => ({
          ...tab,
          isActive: tab.id === nextTab.id
        }));
      }

      // Reorder positions
      return newTabs.map((tab, index) => ({
        ...tab,
        position: index
      }));
    });
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prevTabs => {
      const newTabs = [...prevTabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);

      // Update positions
      return newTabs.map((tab, index) => ({
        ...tab,
        position: index
      }));
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
  }, []);

  const closeOtherTabs = useCallback((keepTabId: string) => {
    setTabs(prevTabs =>
      prevTabs
        .filter(tab => tab.id === keepTabId)
        .map(tab => ({ ...tab, isActive: true, position: 0 }))
    );
  }, []);

  const getActiveTab = useCallback(() => {
    return tabs.find(tab => tab.isActive);
  }, [tabs]);

  const getTabByNoteId = useCallback((noteId: string) => {
    return tabs.find(tab => tab.noteId === noteId);
  }, [tabs]);

  const isNoteOpen = useCallback((noteId: string) => {
    return tabs.some(tab => tab.noteId === noteId);
  }, [tabs]);

  const openNoteInTab = useCallback((noteId: string, title?: string) => {
    // If note is already open, just activate that tab
    const existingTab = getTabByNoteId(noteId);
    if (existingTab) {
      selectTab(existingTab.id);
      return existingTab.id;
    }

    // Create new tab
    return createNewTab(noteId, title);
  }, [getTabByNoteId, selectTab, createNewTab]);

  return {
    tabs,
    activeTab: getActiveTab(),
    createNewTab,
    selectTab,
    closeTab,
    reorderTabs,
    closeAllTabs,
    closeOtherTabs,
    openNoteInTab,
    isNoteOpen,
    getTabByNoteId,
    tabCount: tabs.length
  };
}