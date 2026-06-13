import { create } from 'zustand';
import type { Lesson, Stage, Problem } from '../types/course';

interface CourseState {
  stages: Stage[];
  lessons: Lesson[];
  unlockedLessons: Set<string>;
  searchQuery: string;
  expandedStages: Set<string>;
  expandedLessons: Set<string>;

  setData: (stages: Stage[], lessons: Lesson[]) => void;
  setSearchQuery: (q: string) => void;
  toggleStage: (id: string) => void;
  toggleLesson: (id: string) => void;
  unlockLesson: (id: string) => void;
  unlockLessonsUpTo: (order: number) => void;
  isUnlocked: (lessonId: string) => boolean;

  getFiltered: (stage: Stage) => Lesson[];
  getLessonByOrder: (order: number) => Lesson | undefined;
  getAllProblems: (lesson: Lesson) => Problem[];
}

export const useCourseStore = create<CourseState>((set, get) => ({
  stages: [],
  lessons: [],
  unlockedLessons: new Set(),
  searchQuery: '',
  expandedStages: new Set(),
  expandedLessons: new Set(),

  setData: (stages, lessons) => {
    set({ stages, lessons, expandedStages: new Set() });
  },

  setSearchQuery: (q) => set({ searchQuery: q.trim() }),

  toggleStage: (id) => {
    set(s => {
      const next = new Set(s.expandedStages);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { expandedStages: next };
    });
  },

  toggleLesson: (id) => {
    set(s => {
      const next = new Set(s.expandedLessons);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { expandedLessons: next };
    });
  },

  unlockLesson: (id) => {
    set(s => {
      const next = new Set(s.unlockedLessons);
      next.add(id);
      return { unlockedLessons: next };
    });
  },

  unlockLessonsUpTo: (order) => {
    const { lessons } = get();
    const ids = lessons.filter(l => l.order <= order).map(l => l.id);
    set(s => {
      const next = new Set(s.unlockedLessons);
      ids.forEach(id => next.add(id));
      return { unlockedLessons: next };
    });
  },

  isUnlocked: (lessonId) => get().unlockedLessons.has(lessonId),

  getFiltered: (stage) => {
    const { lessons, searchQuery } = get();
    return lessons.filter(l => {
      if (l.order < stage.lessonRange[0] || l.order > stage.lessonRange[1]) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return l.title.toLowerCase().includes(q) ||
        (l.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (l.knowledgePoints || []).some(k => (typeof k === 'string' ? k : k.name).toLowerCase().includes(q)) ||
        (l.homework || []).some(h => (h.title || '').toLowerCase().includes(q));
    });
  },

  getLessonByOrder: (order) => get().lessons.find(l => l.order === order),

  getAllProblems: (lesson) => [
    ...(lesson.review || []),
    ...(lesson.inClassCodes || []),
    ...(lesson.inClassQuiz || []),
    ...(lesson.homework || []),
    ...(lesson.extended || []),
  ],
}));
