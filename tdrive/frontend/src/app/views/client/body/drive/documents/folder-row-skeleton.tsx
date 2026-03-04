import React from 'react';

type Props = {
  count?: number;
};

const SkeletonRow = ({ index, total }: { index: number; total: number }) => (
  <div
    className={
      'flex flex-row items-center border border-zinc-200 dark:border-zinc-800 px-4 py-3 animate-pulse ' +
      (index === 0 ? 'rounded-t-md ' : '-mt-px ') +
      (index === total - 1 ? 'rounded-b-md ' : '') +
      'border-0 md:border'
    }
  >
    {/* Icon placeholder */}
    <div className="mr-2 -ml-1 h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-700 shrink-0" />
    {/* Name placeholder */}
    <div className="grow">
      <div
        className="h-4 rounded bg-zinc-200 dark:bg-zinc-700"
        style={{ width: `${40 + ((index * 37) % 40)}%` }}
      />
    </div>
    {/* Date placeholder (hidden on mobile) */}
    <div className="shrink-0 ml-4 mr-12 hidden md:block">
      <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
    {/* Size placeholder */}
    <div className="shrink-0 ml-4 mr-4 md:mr-0">
      <div className="h-3 w-12 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
    {/* Menu button placeholder */}
    <div className="shrink-0 ml-4">
      <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
    </div>
  </div>
);

export const FolderRowSkeleton = ({ count = 6 }: Props) => {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} index={i} total={count} />
      ))}
    </div>
  );
};

const GallerySkeletonCard = ({ index }: { index: number }) => (
  <div className="animate-pulse rounded-lg border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
    {/* Thumbnail placeholder */}
    <div
      className="aspect-square w-full rounded-t-lg bg-zinc-200 dark:bg-zinc-700"
    />
    {/* Meta placeholder */}
    <div className="px-3 py-2 h-[52px]">
      <div
        className="h-3.5 rounded bg-zinc-200 dark:bg-zinc-700 mb-1.5"
        style={{ width: `${50 + ((index * 29) % 40)}%` }}
      />
      <div className="h-2.5 w-12 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  </div>
);

export const GallerySkeleton = ({ count = 12 }: Props) => {
  return (
    <div className="p-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <GallerySkeletonCard key={i} index={i} />
        ))}
      </div>
    </div>
  );
};
