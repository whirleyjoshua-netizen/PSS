-- How much a line's frame adds to the window's width and to its height, in eighths of an inch
-- (owner 2026-11-12: Norman bills sq ft on the outside of the frame, so a 2" deco frame adds 4"
-- each way). The guide takes the window size, bills on window + frame, and the quote shows the
-- window size. 0 bills the window size as entered. Safe to re-run.
alter table shutter_lines add column if not exists frame_add_eighths integer not null default 0;

alter table shutter_lines drop constraint if exists shutter_lines_frame_add_check;
alter table shutter_lines add constraint shutter_lines_frame_add_check check (
  frame_add_eighths between 0 and 96
);
