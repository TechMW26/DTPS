'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Button } from './button';
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Heading2,
  Undo,
  Redo
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = 'Enter text...',
  className,
  minHeight = '120px'
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || '';
        setIsEmpty(!value || value === '<br>' || value === '');
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      const content = editorRef.current.innerHTML;
      setIsEmpty(!content || content === '<br>' || content === '');
      onChange(content);
    }
  }, [onChange]);

  const execCommand = useCallback((command: string, value?: string) => {
    // Focus the editor first
    editorRef.current?.focus();
    
    // For formatBlock, we need to wrap the value in angle brackets
    if (command === 'formatBlock' && value) {
      document.execCommand(command, false, `<${value}>`);
    } else {
      document.execCommand(command, false, value);
    }
    
    // Trigger update after a small delay
    setTimeout(() => {
      handleInput();
    }, 10);
  }, [handleInput]);

  const insertList = useCallback((ordered: boolean) => {
    editorRef.current?.focus();
    const command = ordered ? 'insertOrderedList' : 'insertUnorderedList';
    document.execCommand(command, false);
    setTimeout(() => handleInput(), 10);
  }, [handleInput]);

  return (
    <div className={cn("border rounded-lg overflow-hidden bg-white", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-gray-50 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Bold (Ctrl+B)"
          onClick={() => execCommand('bold')}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Italic (Ctrl+I)"
          onClick={() => execCommand('italic')}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Underline (Ctrl+U)"
          onClick={() => execCommand('underline')}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <Underline className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-6 bg-gray-300 mx-1" />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Bullet List"
          onClick={() => insertList(false)}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Numbered List"
          onClick={() => insertList(true)}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-6 bg-gray-300 mx-1" />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Heading (H2)"
          onClick={() => execCommand('formatBlock', 'h2')}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-6 bg-gray-300 mx-1" />
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Undo (Ctrl+Z)"
          onClick={() => execCommand('undo')}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Redo (Ctrl+Y)"
          onClick={() => execCommand('redo')}
          className="h-8 w-8 p-0 hover:bg-gray-200"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Area */}
      <div className="relative">
        {isEmpty && (
          <div 
            className="absolute top-3 left-3 text-gray-400 pointer-events-none"
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onFocus={() => setIsEmpty(!editorRef.current?.innerHTML || editorRef.current?.innerHTML === '<br>')}
          onBlur={() => setIsEmpty(!editorRef.current?.innerHTML || editorRef.current?.innerHTML === '<br>')}
          className="p-3 outline-none min-h-[120px] [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2 [&_li]:my-1 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline"
          style={{ minHeight }}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}
