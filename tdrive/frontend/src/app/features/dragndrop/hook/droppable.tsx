import React from 'react';
import {useDroppable} from '@dnd-kit/core';

type DroppableProps={
  children: React.ReactNode
  id: any
  data?: Record<string, any>
}

export function Droppable(props:DroppableProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `droppable-${props.id}`,
    data: props.data || {
      child: props.children
    },
  });
  
  return (
    <div ref={setNodeRef} className={isOver ? "bg-sky-500/[.18] rounded-t-md rounded-b-md" : ""}>
      {props.children}
    </div>
  );
}
  
