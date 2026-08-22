'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Angry,
  CircleAlert,
  Frown,
  Heart,
  Laugh,
  Plus,
  Smile,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';

interface Reaction {
  emoji: string;
  userId: string;
  userName: string;
  createdAt: string;
}

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string, emoji: string) => void;
  currentUserId: string;
  className?: string;
}

const QUICK_REACTIONS: Array<{ value: string; label: string; icon: LucideIcon }> = [
  { value: '\u{1F44D}', label: 'Like', icon: ThumbsUp },
  { value: '\u{2764}\u{FE0F}', label: 'Love', icon: Heart },
  { value: '\u{1F602}', label: 'Laugh', icon: Laugh },
  { value: '\u{1F62E}', label: 'Surprised', icon: CircleAlert },
  { value: '\u{1F622}', label: 'Sad', icon: Frown },
  { value: '\u{1F621}', label: 'Angry', icon: Angry },
];

const REACTION_ICON_BY_VALUE = new Map(
  QUICK_REACTIONS.map(({ value, icon, label }) => [value, { icon, label }])
);

function ReactionIcon({ value, className = 'h-4 w-4' }: { value: string; className?: string }) {
  const reaction = REACTION_ICON_BY_VALUE.get(value);
  const Icon = reaction?.icon || Smile;
  return <Icon aria-hidden="true" className={className} />;
}

export function MessageReactions({
  messageId,
  reactions,
  onAddReaction,
  onRemoveReaction,
  currentUserId,
  className
}: MessageReactionsProps) {
  const [showQuickReactions, setShowQuickReactions] = useState(false);
  const [showAllReactions, setShowAllReactions] = useState(false);
  const quickReactionsRef = useRef<HTMLDivElement>(null);

  // Group reactions by emoji
  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = [];
    }
    acc[reaction.emoji].push(reaction);
    return acc;
  }, {} as Record<string, Reaction[]>);

  // Close quick reactions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickReactionsRef.current && !quickReactionsRef.current.contains(event.target as Node)) {
        setShowQuickReactions(false);
      }
    };

    if (showQuickReactions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showQuickReactions]);

  const handleReactionClick = (emoji: string) => {
    const userReaction = groupedReactions[emoji]?.find(r => r.userId === currentUserId);
    
    if (userReaction) {
      onRemoveReaction(messageId, emoji);
    } else {
      onAddReaction(messageId, emoji);
    }
    
    setShowQuickReactions(false);
  };

  const getReactionTooltip = (emoji: string, reactions: Reaction[]) => {
    if (reactions.length === 0) return '';
    
    if (reactions.length === 1) {
      return reactions[0].userName;
    } else if (reactions.length <= 3) {
      return reactions.map(r => r.userName).join(', ');
    } else {
      const first = reactions.slice(0, 2).map(r => r.userName).join(', ');
      return `${first} and ${reactions.length - 2} others`;
    }
  };

  if (reactions.length === 0 && !showQuickReactions) {
    return (
      <div className={cn("relative", className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowQuickReactions(true)}
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Plus className="w-3 h-3" />
        </Button>
        
        {showQuickReactions && (
          <div
            ref={quickReactionsRef}
            className="absolute bottom-full left-0 mb-2 bg-white border rounded-lg shadow-lg p-2 flex space-x-1 z-10 animate-in slide-in-from-bottom-2 duration-200"
          >
            {QUICK_REACTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                onClick={() => handleReactionClick(value)}
                aria-label={`React with ${label}`}
                title={label}
                className="h-9 w-9 p-0 hover:bg-gray-100 transition-colors"
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1 mt-1", className)}>
      {/* Existing reactions */}
      {Object.entries(groupedReactions).map(([emoji, reactionList]) => {
        const userHasReacted = reactionList.some(r => r.userId === currentUserId);
        
        return (
          <Button
            key={emoji}
            variant="outline"
            size="sm"
            onClick={() => handleReactionClick(emoji)}
            className={cn(
              "h-6 px-2 py-0 text-xs rounded-full transition-all duration-200 hover:scale-105",
              userHasReacted 
                ? "bg-blue-100 border-blue-300 text-blue-700" 
                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
            )}
            title={getReactionTooltip(emoji, reactionList)}
          >
            <ReactionIcon value={emoji} className="mr-1 h-3.5 w-3.5" />
            <span className="text-xs">{reactionList.length}</span>
          </Button>
        );
      })}

      {/* Add reaction button */}
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowQuickReactions(true)}
          className="h-6 w-6 p-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <Plus className="w-3 h-3" />
        </Button>
        
        {showQuickReactions && (
          <div
            ref={quickReactionsRef}
            className="absolute bottom-full left-0 mb-2 bg-white border rounded-lg shadow-lg p-2 flex space-x-1 z-10 animate-in slide-in-from-bottom-2 duration-200"
          >
            {QUICK_REACTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                onClick={() => handleReactionClick(value)}
                aria-label={`React with ${label}`}
                title={label}
                className={cn(
                  "h-9 w-9 p-0 hover:bg-gray-100 transition-colors",
                  groupedReactions[value]?.some(r => r.userId === currentUserId) && "bg-blue-100"
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Show all reactions button (if many reactions) */}
      {reactions.length > 6 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAllReactions(true)}
          className="h-6 px-2 py-0 text-xs text-gray-500 hover:text-gray-700"
        >
          <Smile className="w-3 h-3 mr-1" />
          All
        </Button>
      )}

      {/* All reactions modal would go here */}
      {showAllReactions && (
        <div className="client-popup-above-nav fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="client-popup-panel mx-4 w-full max-w-md rounded-lg bg-white p-4">
            <h3 className="font-medium mb-3">Reactions</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Object.entries(groupedReactions).map(([emoji, reactionList]) => (
                <div key={emoji} className="flex items-center space-x-3">
                  <ReactionIcon value={emoji} />
                  <div className="flex-1">
                    <div className="text-sm text-gray-600">
                      {reactionList.map(r => r.userName).join(', ')}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {reactionList.length}
                  </span>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllReactions(false)}
              className="mt-3 w-full"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
