import React from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import type { ZoomLevel } from '../types';

interface TimelineToolbarProps {
  zoom: ZoomLevel;
  onNavigate: (direction: 1 | -1) => void;
  onGoToToday: () => void;
  onSetZoom: (updater: (z: ZoomLevel) => ZoomLevel) => void;
}

const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
  zoom,
  onNavigate,
  onGoToToday,
  onSetZoom,
}) => {
  return (
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-white flex items-center gap-2">Timeline View</CardTitle>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors"
          onClick={() => onNavigate(-1)}
          title="Previous"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors text-sm"
          onClick={onGoToToday}
        >
          Today
        </button>
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors"
          onClick={() => onNavigate(1)}
          title="Next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-gray-600 mx-1" />
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors disabled:opacity-40"
          onClick={() => onSetZoom((z) => (z === 'month' ? 'week' : z === 'week' ? 'day' : 'day'))}
          disabled={zoom === 'day'}
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors disabled:opacity-40"
          onClick={() =>
            onSetZoom((z) => (z === 'day' ? 'week' : z === 'week' ? 'month' : 'month'))
          }
          disabled={zoom === 'month'}
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>
    </CardHeader>
  );
};

export default TimelineToolbar;
