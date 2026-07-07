import { describe, it, expect, vi } from 'vitest';
import { renderPlain } from '@/test-utils/render';
import CommentThread, {
  type CommentThreadComment,
  type CommentThreadDeveloper,
} from './CommentThread';

// CommentThread is a controlled, presentational thread: the parent owns the
// POST mutation and passes `onSubmit` + `isPosting`. So "posting fires the
// correct request" is asserted at the component's contract boundary — onSubmit
// is called with (content, type) — rather than at the wire (there is no
// apiFetch in this component). The error path is likewise the parent's; the
// component only reflects `isPosting` by disabling its submit buttons.

const comment = (patch: Partial<CommentThreadComment>): CommentThreadComment => ({
  id: 1,
  content: 'Looks good to me',
  author_name: 'Ada Lovelace',
  comment_type: 'comment',
  mentions: [],
  created_at: '2026-06-01T00:00:00Z',
  ...patch,
});

const developers: CommentThreadDeveloper[] = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@arsenalai.com' },
  { id: 2, name: 'Alan Turing', email: 'alan@arsenalai.com' },
];

describe('CommentThread — rendering seeded comments', () => {
  it('renders the empty state with no comments', () => {
    const { getByText } = renderPlain(
      <CommentThread comments={[]} allDevelopers={[]} isPosting={false} onSubmit={vi.fn()} />,
    );
    expect(getByText('No comments yet. Be the first to comment!')).toBeInTheDocument();
  });

  it('renders seeded comment content + author', () => {
    const { getByText } = renderPlain(
      <CommentThread
        comments={[comment({ content: 'Ship it', author_name: 'Alan Turing' })]}
        allDevelopers={developers}
        isPosting={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(getByText('Ship it')).toBeInTheDocument();
    expect(getByText('Alan Turing')).toBeInTheDocument();
  });

  it('shows a BLOCKER pill on an unresolved blocker and RESOLVED once resolved', () => {
    const { getByText, rerender } = renderPlain(
      <CommentThread
        comments={[comment({ comment_type: 'blocker', is_resolved: false })]}
        allDevelopers={developers}
        isPosting={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(getByText('BLOCKER')).toBeInTheDocument();
    rerender(
      <CommentThread
        comments={[comment({ comment_type: 'blocker', is_resolved: true })]}
        allDevelopers={developers}
        isPosting={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(getByText('RESOLVED')).toBeInTheDocument();
  });

  it('highlights an @mention as a pill using the developer roster', () => {
    const { getByText } = renderPlain(
      <CommentThread
        comments={[comment({ content: 'ping @Ada Lovelace please', mentions: [1] })]}
        allDevelopers={developers}
        isPosting={false}
        onSubmit={vi.fn()}
      />,
    );
    // The mention token is rendered as its own element: "@Ada Lovelace".
    expect(getByText('@Ada Lovelace')).toBeInTheDocument();
  });
});

describe('CommentThread — posting fires onSubmit with the right (content, type)', () => {
  it('full variant: Comment button submits type "comment"', async () => {
    const onSubmit = vi.fn();
    const { getByRole, user } = renderPlain(
      <CommentThread comments={[]} allDevelopers={[]} isPosting={false} onSubmit={onSubmit} />,
    );
    await user.type(getByRole('textbox'), 'Hello world');
    await user.click(getByRole('button', { name: /Comment/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Hello world', 'comment');
  });

  it('full variant: Report Blocker submits type "blocker"', async () => {
    const onSubmit = vi.fn();
    const { getByRole, user } = renderPlain(
      <CommentThread comments={[]} allDevelopers={[]} isPosting={false} onSubmit={onSubmit} />,
    );
    await user.type(getByRole('textbox'), 'This is blocked');
    await user.click(getByRole('button', { name: /Report Blocker/i }));
    expect(onSubmit).toHaveBeenCalledWith('This is blocked', 'blocker');
  });

  it('full variant: Business Review submits type "business_review"', async () => {
    const onSubmit = vi.fn();
    const { getByRole, user } = renderPlain(
      <CommentThread comments={[]} allDevelopers={[]} isPosting={false} onSubmit={onSubmit} />,
    );
    await user.type(getByRole('textbox'), 'Needs sign-off');
    await user.click(getByRole('button', { name: /Business Review/i }));
    expect(onSubmit).toHaveBeenCalledWith('Needs sign-off', 'business_review');
  });

  it('simple variant: single Post button submits type "comment"', async () => {
    const onSubmit = vi.fn();
    const { getByRole, user } = renderPlain(
      <CommentThread
        comments={[]}
        allDevelopers={[]}
        isPosting={false}
        onSubmit={onSubmit}
        variant="simple"
      />,
    );
    await user.type(getByRole('textbox'), 'quick note');
    await user.click(getByRole('button', { name: /Post comment/i }));
    expect(onSubmit).toHaveBeenCalledWith('quick note', 'comment');
  });

  it('clears the textarea after a submit', async () => {
    const { getByRole, user } = renderPlain(
      <CommentThread comments={[]} allDevelopers={[]} isPosting={false} onSubmit={vi.fn()} />,
    );
    const box = getByRole('textbox');
    await user.type(box, 'temp text');
    await user.click(getByRole('button', { name: /Comment/i }));
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('does not submit empty/whitespace-only content', async () => {
    const onSubmit = vi.fn();
    const { getByRole, user } = renderPlain(
      <CommentThread comments={[]} allDevelopers={[]} isPosting={false} onSubmit={onSubmit} />,
    );
    await user.type(getByRole('textbox'), '   ');
    await user.click(getByRole('button', { name: /Comment/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables submit while a post is in flight (isPosting reflects parent mutation state)', () => {
    const { getByRole } = renderPlain(
      <CommentThread comments={[]} allDevelopers={[]} isPosting onSubmit={vi.fn()} />,
    );
    expect(getByRole('button', { name: /Comment/i })).toBeDisabled();
    expect(getByRole('button', { name: /Report Blocker/i })).toBeDisabled();
  });
});

describe('CommentThread — @mention picker + resolve affordance', () => {
  it('opens the mention picker on "@" and inserts the picked developer', async () => {
    const { getByRole, getByText, user } = renderPlain(
      <CommentThread
        comments={[]}
        allDevelopers={developers}
        isPosting={false}
        onSubmit={vi.fn()}
      />,
    );
    const box = getByRole('textbox') as HTMLTextAreaElement;
    await user.type(box, 'hey @Al');
    // Picker filters to matching developers.
    await user.click(getByText('Alan Turing'));
    expect(box.value).toBe('hey @Alan Turing ');
  });

  it('shows "No matching developers" when the filter matches nobody', async () => {
    const { getByRole, getByText, user } = renderPlain(
      <CommentThread
        comments={[]}
        allDevelopers={developers}
        isPosting={false}
        onSubmit={vi.fn()}
      />,
    );
    await user.type(getByRole('textbox'), '@zzzzz');
    expect(getByText('No matching developers')).toBeInTheDocument();
  });

  it('fires onResolveComment for an unresolved blocker when the handler is provided', async () => {
    const onResolveComment = vi.fn();
    const { getByRole, user } = renderPlain(
      <CommentThread
        comments={[comment({ id: 42, comment_type: 'blocker', is_resolved: false })]}
        allDevelopers={developers}
        isPosting={false}
        onSubmit={vi.fn()}
        onResolveComment={onResolveComment}
      />,
    );
    await user.click(getByRole('button', { name: /Resolve/i }));
    expect(onResolveComment).toHaveBeenCalledWith(42);
  });
});
