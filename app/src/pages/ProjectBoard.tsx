import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TimeEntriesTable from '@/components/TimeEntriesTable';
import {
    ArrowLeft,
    Plus,
    Sparkles,
    BookOpen,
    ClipboardList,
    Bug,
    Target,
    Clock,
    CheckCircle2,
    X,
    Save,
    Trash2,
    Pencil,
    Search,
    LayoutGrid,
    List,
    Layers,
    BarChart3,
    AlertCircle,
    MessageSquare,
    Upload,
    FileText,
    ArrowRight,
    Users,
    GitCommit,
    Inbox,
    Calendar,
    Eye,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast, Toaster } from 'sonner';
import ArchitectureCard from '@/components/ArchitectureCard';
import ArchitectureEditor from '@/components/ArchitectureEditor';
import { ReviewerView } from '@/components/ProjectHub';
import { useAuth } from '@/contexts/AuthContext';

import { API_BASE_URL } from '@/config/api';

// Helper function to parse YYYY-MM-DD string to local Date object (avoids UTC timezone issues)
const parseLocalDate = (dateString: string | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

interface WorkItem {
    id: string;
    key: string;  // Ticket key like PROJ-123
    type: 'user_story' | 'task' | 'bug' | 'epic';
    title: string;
    description: string;
    status: 'todo' | 'in_progress' | 'in_review' | 'done';
    assigned_hours: number;
    remaining_hours: number;
    logged_hours: number;
    story_points: number;
    priority: 'high' | 'medium' | 'low' | 'critical';
    assignee: string;
    assignee_id: number | null;
    sprint: string;
    sprint_id: number | null;
    product_id: string;
    tags: string[];
    epic: string;
    parent_id?: number | null;
    epic_id?: number | null;
    parent_key?: string | null;
    epic_key?: string | null;
    created_at?: string;
    updated_at?: string;
    due_date?: string | null;
    estimated_hours?: number | null;
}

interface Developer {
    id: number;
    name: string;
    email: string;
    github_username?: string;
    role: string;
    responsibilities?: string;
}

interface Project {
    id: number;
    name: string;
    description: string;
    key_prefix: string;
    status: string;
    created_at: string;
    work_item_stats: {
        total: number;
        by_status: Record<string, number>;
        total_points: number;
        completed: number;
        completion_pct: number;
    };
    developers?: Developer[];
}

interface Architecture {
    id: number;
    name: string;
    description: string;
    architecture_type: string;
    mermaid_code: string;
    pros: string[];
    cons: string[];
    estimated_cost: string;
    complexity: string;
    time_to_implement: string;
    is_selected: boolean;
}

interface PRDAnalysis {
    id: number;
    summary: string;
    key_features: string[];
    technical_requirements: string[];
    cost_analysis: any;
    recommended_tools: any;
    risks: any[];
    timeline: any[];
}

interface GeneratedTicket {
    title: string;
    description: string;
    type: string;
    priority: string;
    story_points: number;
    estimated_hours: number;
    assignee_name: string;
    assignee_id: number | null;
    assignee_reasoning: string;
    tags: string[];
    sprint_number?: number;
    sprint_name?: string;
}

interface Sprint {
    id: number;
    name: string;
    goal: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    capacity_hours: number | null;
    velocity: number | null;
    total_items: number;
    todo_count: number;
    in_progress_count: number;
    done_count: number;
    total_points: number;
    completed_points: number;
    completion_pct: number;
}

type AIStep = 'upload' | 'analyzing' | 'architectures' | 'preview' | 'committing' | 'done';

const STATUS_CONFIG = {
    backlog: { label: 'Backlog', color: '#737373', icon: Inbox, gradient: 'from-[#737373]/10' },
    todo: { label: 'To Do', color: '#E0B954', icon: Plus, gradient: 'from-[#E0B954]/10' },
    in_progress: { label: 'In Progress', color: '#F59E0B', icon: Clock, gradient: 'from-[#F59E0B]/10' },
    in_review: { label: 'In Review', color: '#C79E3B', icon: AlertCircle, gradient: 'from-[#C79E3B]/10' },
    done: { label: 'Done', color: '#E0B954', icon: CheckCircle2, gradient: 'from-[#E0B954]/10' },
} as const;

const TYPE_CONFIG = {
    user_story: { icon: BookOpen, color: '#E0B954', label: 'Story', bg: 'rgba(224,185,84,0.15)' },
    task: { icon: ClipboardList, color: '#F59E0B', label: 'Task', bg: 'rgba(245,158,11,0.15)' },
    bug: { icon: Bug, color: '#EF4444', label: 'Bug', bg: 'rgba(239,68,68,0.15)' },
    epic: { icon: Target, color: '#C79E3B', label: 'Epic', bg: 'rgba(199,158,59,0.15)' },
};

const PRIORITY_COLORS = {
    critical: { border: 'border-red-500/60', text: 'text-red-400', bg: 'bg-red-500/10' },
    high: { border: 'border-orange-500/60', text: 'text-orange-400', bg: 'bg-orange-500/10' },
    medium: { border: 'border-yellow-500/50', text: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    low: { border: 'border-emerald-500/50', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

const ProjectBoard = () => {
    const { id, ticketId } = useParams<{ id: string; ticketId?: string }>();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [project, setProject] = useState<Project | null>(null);
    const [workItems, setWorkItems] = useState<WorkItem[]>([]);
    const [showReviewer, setShowReviewer] = useState(false);
    const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editForm, setEditForm] = useState<Partial<WorkItem>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCreatingItem, setIsCreatingItem] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterAssignee, setFilterAssignee] = useState<string>('all');
    const [filterTags, setFilterTags] = useState<string[]>([]);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [assigneeSearchFilter, setAssigneeSearchFilter] = useState('');
    const filterMenuRef = useRef<HTMLDivElement>(null);
    const [draggedItem, setDraggedItem] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    
    // AI Planning flow states
    const [showAIModal, setShowAIModal] = useState(false);
    const [aiStep, setAiStep] = useState<AIStep>('upload');
    const [uploadMode, setUploadMode] = useState<'prd' | 'roadmap'>('prd');  // Toggle between PRD and Roadmap
    const [prdFile, setPrdFile] = useState<File | null>(null);
    const [prdText, setPrdText] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');
    const [analysis, setAnalysis] = useState<PRDAnalysis | null>(null);
    const [architectures, setArchitectures] = useState<Architecture[]>([]);
    const [selectedArchitectureId, setSelectedArchitectureId] = useState<number | null>(null);
    const [editingArchitecture, setEditingArchitecture] = useState<Architecture | null>(null);
    const [generatedTickets, setGeneratedTickets] = useState<GeneratedTicket[]>([]);
    const [ticketsSummary, setTicketsSummary] = useState<{ total_story_points: number; total_estimated_hours: number; sprint_recommendation: string } | null>(null);
    const [roadmapFile, setRoadmapFile] = useState<File | null>(null);
    const [sprintWeeks, setSprintWeeks] = useState<number>(2);
    const [roadmapSummary, setRoadmapSummary] = useState<any>(null);
    const [roadmapParsedData, setRoadmapParsedData] = useState<any>(null);
    const [createdTicketCount, setCreatedTicketCount] = useState<number>(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Sprint and timeline states
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sprints, setSprints] = useState<Sprint[]>([]);
    const [selectedSprintId, setSelectedSprintId] = useState<number | 'all' | 'backlog'>('all');
    const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
    const [newSprint, setNewSprint] = useState({ name: '', goal: '', start_date: '', end_date: '' });

    // Calendar popover states
    const [showCalendarCreateForm, setShowCalendarCreateForm] = useState(false);
    const [showCalendarEditForm, setShowCalendarEditForm] = useState(false);
    const [showCalendarSprintStart, setShowCalendarSprintStart] = useState(false);
    const [showCalendarSprintEnd, setShowCalendarSprintEnd] = useState(false);

    // Comments state
    const [comments, setComments] = useState<Array<{
        id: number;
        work_item_id: number;
        author_id: number | null;
        author_name: string;
        content: string;
        mentions: number[];
        comment_type: string;
        created_at: string;
        updated_at: string;
    }>>([]);
    const [newComment, setNewComment] = useState('');
    const [showMentions, setShowMentions] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [allDevelopers, setAllDevelopers] = useState<Array<{ id: number; name: string; email: string }>>([]);

    const [createForm, setCreateForm] = useState({
        type: 'user_story',
        title: '',
        description: '',
        priority: 'medium',
        story_points: 3,
        assignee_id: null as number | null,
        sprint: 'Backlog',
        epic_id: null as number | null,
        parent_id: null as number | null,
        due_date: '' as string,
        estimated_hours: '' as string | number,
        tags: [] as string[],
    });
    const [tagInput, setTagInput] = useState('');
    const [existingTags, setExistingTags] = useState<string[]>([]);

    // Extract unique tags from all tasks in the current project
    useEffect(() => {
        const allTags = new Set<string>();
        const tasks = workItems.filter(item => item.type === 'task');
        
        tasks.forEach(item => {
            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach((tag: string | any) => {
                    const tagStr = String(tag).trim().toLowerCase();
                    if (tagStr) {
                        allTags.add(tagStr);
                    }
                });
            }
        });
        
        const tagsArray = Array.from(allTags).sort();
        setExistingTags(tagsArray);
    }, [workItems]);

    // Client-side comment cache (cache-aside pattern) — avoids re-fetching on re-open
    const commentCache = useRef<Map<string, Array<{
        id: number; work_item_id: number; author_id: number; author_name: string;
        content: string; mentions: number[]; comment_type: string;
        created_at: string; updated_at: string;
    }>>>(new Map());

    // Prefetch comments for a ticket (call on hover) — data is ready before click
    const prefetchComments = useCallback((itemId: string) => {
        if (!token || commentCache.current.has(itemId)) return;
        fetch(`${API_BASE_URL}/api/comments/workitem/${itemId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.ok ? r.json() : null)
          .then(data => { if (data) commentCache.current.set(itemId, data); })
          .catch(() => {});
    }, [token]);

    // Fetch project and work items — NEVER re-runs on ticket click
    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            try {
                const headers = { 'Authorization': `Bearer ${token}` };
                const [projRes, itemsRes, sprintsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/projects/${id}`, { headers }),
                    fetch(`${API_BASE_URL}/api/workitems/?project_id=${id}`, { headers }),
                    fetch(`${API_BASE_URL}/api/workitems/projects/${id}/sprints`, { headers }),
                ]);
                if (projRes.ok) setProject(await projRes.json());
                if (itemsRes.ok) setWorkItems(await itemsRes.json());
                if (sprintsRes.ok) setSprints(await sprintsRes.json());
            } catch (err) {
                console.error('Failed to fetch data:', err);
                toast.error('Failed to load project data');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [id, token]); // ticketId intentionally excluded — clicking a ticket must NOT re-fetch all data

    // Handle URL-based ticket selection — reads from already-loaded workItems (instant)
    useEffect(() => {
        if (!ticketId) {
            setSelectedItem(null);
            setIsEditing(false);
            setEditForm({});
            return;
        }
        if (workItems.length > 0) {
            const found = workItems.find(item => item.id === ticketId);
            if (found) setSelectedItem(found);
        }
    }, [ticketId, workItems]);

    // Close filter menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setShowFilterMenu(false);
                setAssigneeSearchFilter('');
            }
        };
        if (showFilterMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showFilterMenu]);

    // Refresh project stats
    const refreshProjectStats = useCallback(async () => {
        if (!id) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setProject(await res.json());
        } catch { /* ignore */ }
    }, [id, token]);

    // Filtered items
    const filteredItems = workItems.filter(item => {
        if (searchQuery) {
            const searchLower = searchQuery.toLowerCase();
            const titleMatch = item.title.toLowerCase().includes(searchLower);
            const keyMatch = item.key.toLowerCase().includes(searchLower);
            if (!titleMatch && !keyMatch) return false;
        }
        if (filterType !== 'all' && item.type !== filterType) return false;
        if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
        if (filterAssignee !== 'all') {
            if (filterAssignee === 'unassigned') {
                if (item.assignee_id !== null && item.assignee_id !== undefined) return false;
            } else {
                if (String(item.assignee_id) !== filterAssignee) return false;
            }
        }
        // Tags filter - if any tags are selected, item must have at least one of them
        if (filterTags.length > 0) {
            const hasMatchingTag = filterTags.some(tag => item.tags?.includes(tag));
            if (!hasMatchingTag) return false;
        }
        // Sprint filter
        if (selectedSprintId === 'backlog' && item.sprint_id !== null) return false;
        if (typeof selectedSprintId === 'number' && item.sprint_id !== selectedSprintId) return false;
        return true;
    });

    // Drag and drop handlers
    const handleDragStart = (itemId: string) => {
        setDraggedItem(itemId);
    };

    const handleDragOver = (e: React.DragEvent, status: string) => {
        e.preventDefault();
        setDragOverColumn(status);
    };

    const handleDragLeave = () => {
        setDragOverColumn(null);
    };

    const handleDrop = async (e: React.DragEvent, newStatus: string) => {
        e.preventDefault();
        setDragOverColumn(null);
        if (!draggedItem) return;

        // Optimistic update
        setWorkItems(prev => prev.map(item =>
            item.id === draggedItem ? { ...item, status: newStatus as WorkItem['status'] } : item
        ));

        try {
            await fetch(`${API_BASE_URL}/api/workitems/${draggedItem}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }),
            });
            refreshProjectStats();
        } catch {
            toast.error('Failed to update item status');
        }
        setDraggedItem(null);
    };

    const handleCloseCreateForm = () => {
        setShowCreateForm(false);
        setCreateForm({ type: 'user_story', title: '', description: '', priority: 'medium', story_points: 3, assignee_id: null, sprint: 'Backlog', epic_id: null, parent_id: null, due_date: '', estimated_hours: '', tags: [] });
        setTagInput('');
    };

    // Create work item
    const handleCreateItem = async () => {
        
        if (!createForm.title.trim()) {
            toast.error('Title is required');
            return;
        }
        setIsCreatingItem(true);
        const startTime = Date.now();
        try {
            // Build payload explicitly - don't spread createForm with sprint property
            const payload: any = {
                type: createForm.type,
                title: createForm.title,
                description: createForm.description,
                priority: createForm.priority,
                story_points: createForm.type !== 'task' ? createForm.story_points : 0,
                assignee_id: createForm.assignee_id,
                project_id: id,
                status: 'todo',
                tags: Array.isArray(createForm.tags) ? createForm.tags : [],
                epic_id: createForm.epic_id || null,
                parent_id: createForm.parent_id || null,
                due_date: createForm.due_date || null,
                estimated_hours: createForm.estimated_hours ? parseInt(createForm.estimated_hours as string) : 0,
            };
            
            // Calculate hours based on type
            if (createForm.type !== 'task') {
                payload.assigned_hours = createForm.story_points * 4;
                payload.remaining_hours = createForm.story_points * 4;
            } else {
                payload.assigned_hours = payload.estimated_hours || 0;
                payload.remaining_hours = payload.estimated_hours || 0;
            }
            
            const response = await fetch(`${API_BASE_URL}/api/workitems/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            
            if (response.ok) {
                const newItem = await response.json();
                
                // Ensure tags are preserved
                if (newItem.type === 'task' && payload.tags && payload.tags.length > 0) {
                    if (!newItem.tags || newItem.tags.length === 0) {
                        newItem.tags = payload.tags;
                    }
                }
                
                setWorkItems(prev => [...prev, newItem]);
                handleCloseCreateForm();
                toast.success('Work item created!', { duration: 1000 });
                refreshProjectStats();
            } else {
                const errorText = await response.text();
                console.error('❌ API Error Response:', response.status, errorText);
                toast.error(`Failed to create item: ${response.statusText}`);
            }
        } catch (err) {
            console.error('❌ Error creating item:', err);
            toast.error('Failed to create item');
        } finally {
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, 300 - elapsedTime);
            setTimeout(() => {
                setIsCreatingItem(false);
            }, remainingTime);
        }
    };

    // Move ticket to sprint
    const handleMoveToSprint = async (itemId: string, targetSprintId: number | null) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/workitems/${itemId}/move-sprint`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ target_sprint_id: targetSprintId }),
            });
            if (response.ok) {
                const updated = await response.json();
                setWorkItems(prev => prev.map(wi => wi.id === itemId ? updated : wi));
                if (selectedItem?.id === itemId) {
                    setSelectedItem(updated);
                }
                toast.success(targetSprintId ? 'Moved to sprint' : 'Moved to backlog');
                // Refresh sprints
                const sprintsRes = await fetch(`${API_BASE_URL}/api/workitems/projects/${id}/sprints`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (sprintsRes.ok) {
                    setSprints(await sprintsRes.json());
                }
            }
        } catch {
            toast.error('Failed to move ticket');
        }
    };

    // Get next sprint
    const getNextSprint = (currentSprintId: number | null): number | null => {
        if (!currentSprintId || sprints.length === 0) return null;
        const currentIndex = sprints.findIndex(s => s.id === currentSprintId);
        if (currentIndex >= 0 && currentIndex < sprints.length - 1) {
            return sprints[currentIndex + 1].id;
        }
        return null;
    };

    // Create sprint
    const handleCreateSprint = async () => {
        if (!newSprint.name.trim()) {
            toast.error('Sprint name is required');
            return;
        }
        
        // Check for duplicate sprint names
        const duplicateName = sprints.some(s => s.name.trim().toLowerCase() === newSprint.name.trim().toLowerCase());
        if (duplicateName) {
            toast.error('A sprint with this name already exists');
            return;
        }
        
        if (!newSprint.start_date) {
            toast.error('Start date is required');
            return;
        }
        if (!newSprint.end_date) {
            toast.error('End date is required');
            return;
        }

        const startDate = parseLocalDate(newSprint.start_date);
        const endDate = parseLocalDate(newSprint.end_date);
        if (startDate && endDate && endDate < startDate) {
            toast.error('End date must be equal to or after start date');
            return;
        }

        // Check for overlaps with existing sprints
        if (startDate && endDate && sprints.length > 0) {
            const hasOverlap = sprints.some(existingSprint => {
                if (!existingSprint.start_date || !existingSprint.end_date) return false;
                const existingStart = new Date(existingSprint.start_date);
                const existingEnd = new Date(existingSprint.end_date);
                // Check if new sprint overlaps with existing sprint
                return startDate <= existingEnd && endDate >= existingStart;
            });
            if (hasOverlap) {
                toast.error('Sprint dates overlap with an existing sprint. Sprints cannot overlap.');
                return;
            }
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/workitems/sprints/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    project_id: parseInt(id!),
                    name: newSprint.name,
                    goal: newSprint.goal,
                    start_date: newSprint.start_date || null,
                    end_date: newSprint.end_date || null,
                }),
            });
            if (response.ok) {
                toast.success('Sprint created!');
                setShowCreateSprintModal(false);
                setNewSprint({ name: '', goal: '', start_date: '', end_date: '' });
                // Refresh sprints
                const sprintsRes = await fetch(`${API_BASE_URL}/api/workitems/projects/${id}/sprints`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (sprintsRes.ok) {
                    setSprints(await sprintsRes.json());
                }
            }
        } catch {
            toast.error('Failed to create sprint');
        }
    };

    // Fetch all developers for @mentions
    useEffect(() => {
        const fetchAllDevelopers = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/developers/`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    setAllDevelopers(await response.json());
                }
            } catch (error) {
                console.error('Failed to fetch developers:', error);
            }
        };
        fetchAllDevelopers();
    }, [token]);

    // Fetch comments — serves from cache if available (cache-aside pattern)
    useEffect(() => {
        const fetchComments = async () => {
            if (!selectedItem) {
                setComments([]);
                return;
            }
            // Serve from cache instantly if available
            const cached = commentCache.current.get(selectedItem.id);
            if (cached) {
                setComments(cached);
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/api/comments/workitem/${selectedItem.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    commentCache.current.set(selectedItem.id, data); // cache it
                    setComments(data);
                }
            } catch (error) {
                console.error('Failed to fetch comments:', error);
            }
        };
        fetchComments();
    }, [selectedItem]);

    // Handle comment input with @mention detection
    const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setNewComment(value);

        // Check for @mentions
        const lastAtIndex = value.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            const textAfterAt = value.substring(lastAtIndex + 1);
            // Check if there's a space after @ (meaning mention is complete)
            if (!textAfterAt.includes(' ')) {
                setMentionFilter(textAfterAt);
                setShowMentions(true);
            } else {
                setShowMentions(false);
            }
        } else {
            setShowMentions(false);
        }
    };

    // Insert mention
    const insertMention = (developer: { id: number; name: string }) => {
        const lastAtIndex = newComment.lastIndexOf('@');
        const beforeMention = newComment.substring(0, lastAtIndex);
        setNewComment(`${beforeMention}@${developer.name} `);
        setShowMentions(false);
        setMentionFilter('');
    };

    // Submit comment
    const handleSubmitComment = async (commentType: 'comment' | 'blocker' | 'business_review' = 'comment') => {
        if (!selectedItem || !newComment.trim()) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/comments/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    work_item_id: parseInt(selectedItem.id),
                    content: newComment,
                    author_id: project?.developers?.[0]?.id || 1, // TODO: Use actual logged-in user
                    comment_type: commentType,
                }),
            });
            if (response.ok) {
                const newCommentData = await response.json();
                const updated = [newCommentData, ...comments];
                setComments(updated);
                // Invalidate cache so next open fetches fresh
                if (selectedItem) commentCache.current.delete(selectedItem.id);
                setNewComment('');
                const messages = {
                    'blocker': 'Blocker reported!',
                    'business_review': 'Business Review comment added!',
                    'comment': 'Comment added!'
                };
                toast.success(messages[commentType]);
            }
        } catch {
            toast.error('Failed to add comment');
        }
    };

    // Render comment with mentions highlighted and links as clickable
    const renderCommentContent = (content: string, mentions: number[] = []) => {
        // Build a map of developer IDs to names for quick lookup
        const devMap = new Map(allDevelopers.map(d => [d.id, d.name]));
        
        // Replace @name with highlighted version for each mentioned developer
        let result = content;
        mentions.forEach(devId => {
            const devName = devMap.get(devId);
            if (devName) {
                // Replace @devName with highlighted version
                const regex = new RegExp(`@${devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
                result = result.replace(regex, `<<<MENTION_${devId}>>>`);
            }
        });
        
        // Also replace URLs with placeholders
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls: string[] = [];
        result = result.replace(urlRegex, (match) => {
            urls.push(match);
            return `<<<URL_${urls.length - 1}>>>`;
        });
        
        // Parse the result and highlight the placeholders
        const parts = result.split(/(<<<MENTION_\d+>>>|<<<URL_\d+>>>)/g);
        let elementIndex = 0;
        return parts.flatMap((part) => {
            const mentionMatch = part.match(/<<<MENTION_(\d+)>>>/);
            if (mentionMatch) {
                const devId = parseInt(mentionMatch[1]);
                const devName = devMap.get(devId);
                return (
                    <span key={`mention-${elementIndex++}`} className="bg-[rgba(224,185,84,0.2)] text-[#E0B954] px-1.5 py-0.5 rounded-md font-medium">
                        @{devName}
                    </span>
                );
            }
            
            const urlMatch = part.match(/<<<URL_(\d+)>>>/);
            if (urlMatch) {
                const urlIndex = parseInt(urlMatch[1]);
                const url = urls[urlIndex];
                return (
                    <a key={`url-${elementIndex++}`} href={url} target="_blank" rel="noopener noreferrer" className="text-[#E0B954] hover:text-[#C79E3B] underline hover:no-underline transition-colors break-all">
                        {url}
                    </a>
                );
            }
            
            // Handle newlines in text
            if (part.trim()) {
                return part.split('\n').flatMap((line, lineIndex) => [
                    <span key={`text-${elementIndex}-${lineIndex}`}>{line}</span>,
                    lineIndex < part.split('\n').length - 1 ? <br key={`br-${elementIndex}-${lineIndex}`} /> : null
                ]).filter(Boolean);
            }
            
            return part;
        });
    };

    // Render text with newlines preserved
    const renderTextWithNewlines = (text: string) => {
        if (!text) return null;
        return text.split('\n').map((line, index) => [
            <span key={`line-${index}`}>{line}</span>,
            index < text.split('\n').length - 1 ? <br key={`br-${index}`} /> : null
        ]).flat().filter(Boolean);
    };

    // Save edited item
    const handleSaveEdit = async () => {
        if (!selectedItem || isSavingEdit) return;
        setIsSavingEdit(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/workitems/${selectedItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(editForm),
            });
            if (response.ok) {
                const updated = await response.json();
                // Merge so any field the backend response omits (e.g. due_date) still
                // reflects the user's edit instead of vanishing from the panel.
                const merged = { ...selectedItem, ...editForm, ...updated } as WorkItem;
                setWorkItems(prev => prev.map(wi => wi.id === selectedItem.id ? merged : wi));
                setSelectedItem(merged);
                setIsEditing(false);
                setEditForm({});
                toast.success('Item updated!');
                refreshProjectStats();
            }
        } catch {
            toast.error('Failed to update item');
        } finally {
            setIsSavingEdit(false);
        }
    };

    // Delete item
    const handleDeleteItem = async (itemId: string) => {
        if (!confirm('Delete this work item?')) return;
        try {
            await fetch(`${API_BASE_URL}/api/workitems/${itemId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setWorkItems(prev => prev.filter(wi => wi.id !== itemId));
            setSelectedItem(null);
            toast.success('Item deleted');
            refreshProjectStats();
        } catch {
            toast.error('Failed to delete item');
        }
    };

    // Log hours to a work item
    const handleLogHours = async (item: WorkItem, hoursToLog: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/workitems/${item.id}/log-hours`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    hours: hoursToLog,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                // Update the work item with new values
                const updated = { ...item, logged_hours: data.logged_hours, remaining_hours: data.remaining_hours };
                setWorkItems(prev => prev.map(wi => wi.id === item.id ? updated : wi));
                setSelectedItem(updated);
                toast.success(`Logged ${hoursToLog}h! Remaining: ${data.remaining_hours}h`);
                refreshProjectStats();
            }
        } catch {
            toast.error('Failed to log hours');
        }
    };

    // AI Generate - Open the AI Planning Modal
    const handleAIGenerate = () => {
        setShowAIModal(true);
        setAiStep('upload');
        setUploadMode('prd');
        setPrdFile(null);
        setPrdText('');
        setAdditionalContext('');
        setAnalysis(null);
        setArchitectures([]);
        setSelectedArchitectureId(null);
        setGeneratedTickets([]);
        setTicketsSummary(null);
        setRoadmapFile(null);
        setRoadmapSummary(null);
        setRoadmapParsedData(null);
    };

    // Handle file upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain'];
            if (!validTypes.includes(file.type)) {
                toast.error('Please upload a PDF, Word, or text file');
                return;
            }
            setPrdFile(file);
        }
    };

    // Handle roadmap file upload
    const handleRoadmapFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                           file.type === 'application/vnd.ms-excel' ||
                           file.name.endsWith('.xlsx') ||
                           file.name.endsWith('.xls');
            if (!isExcel) {
                toast.error('Please upload an Excel file (.xlsx or .xls)');
                return;
            }
            setRoadmapFile(file);
        }
    };

    // Analyze PRD
    const handleAnalyzePRD = async () => {
        if (!project || (!prdFile && !prdText.trim())) {
            toast.error('Please upload a file or enter PRD content');
            return;
        }

        setAiStep('analyzing');
        setIsGenerating(true);

        try {
            let response;
            
            if (prdFile) {
                // File upload
                const formData = new FormData();
                formData.append('file', prdFile);
                formData.append('project_id', String(project.id));
                formData.append('additional_context', additionalContext);
                
                response = await fetch(`${API_BASE_URL}/api/prd/analyze-file`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
            } else {
                // Text input
                response = await fetch(`${API_BASE_URL}/api/prd/analyze-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        project_id: project.id,
                        prd_content: prdText,
                        additional_context: additionalContext,
                    }),
                });
            }

            if (response.ok) {
                const data = await response.json();
                setAnalysis(data.analysis);
                setArchitectures(data.architectures);
                setAiStep('architectures');
                toast.success('PRD analyzed successfully!');
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to analyze PRD');
                setAiStep('upload');
            }
        } catch (err) {
            toast.error('Failed to analyze PRD');
            setAiStep('upload');
        } finally {
            setIsGenerating(false);
        }
    };

    // Parse Roadmap
    const handleParseRoadmap = async () => {
        if (!project || !roadmapFile) {
            toast.error('Please select a roadmap file');
            return;
        }

        setAiStep('analyzing');
        setIsGenerating(true);

        try {
            const formData = new FormData();
            formData.append('file', roadmapFile);
            formData.append('project_id', String(project.id));
            formData.append('sprint_weeks', String(sprintWeeks));
            
            const response = await fetch(`${API_BASE_URL}/api/roadmap/parse-file`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                setRoadmapSummary(data.summary);
                setRoadmapParsedData(data.parsed_data);
                setAiStep('architectures');  // Reuse architectures step for summary display
                toast.success('Roadmap parsed successfully!');
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to parse roadmap');
                setAiStep('upload');
            }
        } catch (err) {
            toast.error('Failed to parse roadmap');
            setAiStep('upload');
        } finally {
            setIsGenerating(false);
        }
    };

    // Select architecture
    const handleSelectArchitecture = async (archId: number) => {
        setSelectedArchitectureId(archId);
        try {
            await fetch(`${API_BASE_URL}/api/prd/architectures/${archId}/select`, { 
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            console.error('Failed to select architecture:', err);
        }
    };

    // Save architecture edits
    const handleSaveArchitecture = async (archId: number, updates: { mermaid_code?: string; name?: string; description?: string }): Promise<void> => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/prd/architectures/${archId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(updates),
            });
            if (response.ok) {
                const updated = await response.json();
                setArchitectures(prev => prev.map(a => a.id === archId ? updated : a));
                toast.success('Architecture saved!');
                setEditingArchitecture(null);
            }
        } catch (err) {
            toast.error('Failed to save architecture');
        }
    };

    // Preview generated tickets
    const handlePreviewTickets = async () => {
        if (!project || !selectedArchitectureId) return;
        
        setAiStep('preview');
        setIsGenerating(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/prd/projects/${project.id}/generate-tickets-preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ architecture_id: selectedArchitectureId }),
            });

            if (response.ok) {
                const data = await response.json();
                setGeneratedTickets(data.tickets);
                setTicketsSummary({
                    total_story_points: data.total_story_points,
                    total_estimated_hours: data.total_estimated_hours,
                    sprint_recommendation: data.sprint_recommendation,
                });
            } else {
                toast.error('Failed to generate tickets preview');
                setAiStep('architectures');
            }
        } catch (err) {
            toast.error('Failed to generate tickets');
            setAiStep('architectures');
        } finally {
            setIsGenerating(false);
        }
    };

    // Commit architecture and create tickets (PRD mode)
    const handleCommitArchitecture = async () => {
        if (!project || !selectedArchitectureId) return;

        setAiStep('committing');
        setIsGenerating(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/prd/projects/${project.id}/commit-architecture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    architecture_id: selectedArchitectureId,
                    start_date: startDate || null,
                    end_date: endDate || null,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                
                // Check if AI actually created tickets
                if (!data.success || data.tickets_created === 0) {
                    toast.error(data.error || 'AI failed to generate tickets. Existing tickets preserved.');
                    setAiStep('preview');
                    return;
                }
                
                setAiStep('done');
                toast.success(`Created ${data.tickets_created} tickets${data.sprints?.length ? ` in ${data.sprints.length} sprints` : ''}!`);
                setCreatedTicketCount(data.tickets_created);
                
                // Refresh work items and sprints with auth headers
                const [itemsRes, sprintsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/workitems/?project_id=${project.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`${API_BASE_URL}/api/workitems/projects/${project.id}/sprints`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                ]);
                if (itemsRes.ok) {
                    setWorkItems(await itemsRes.json());
                }
                if (sprintsRes.ok) {
                    setSprints(await sprintsRes.json());
                }
                refreshProjectStats();
                
                // Close modal after delay
                setTimeout(() => {
                    setShowAIModal(false);
                }, 2000);
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to commit architecture');
                setAiStep('preview');
            }
        } catch (err) {
            toast.error('Failed to commit architecture');
            setAiStep('preview');
        } finally {
            setIsGenerating(false);
        }
    };

    // Commit roadmap and create tickets (Roadmap mode)
    const handleCommitRoadmap = async () => {
        if (!project || !roadmapParsedData) return;

        setAiStep('committing');
        setIsGenerating(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/roadmap/commit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    project_id: project.id,
                    parsed_data: roadmapParsedData,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                
                setAiStep('done');
                const sprintMsg = data.sprints_created > 0 ? ` and ${data.sprints_created} sprints` : '';
                toast.success(`Created ${data.tickets_created} tasks in ${data.epics_created} epics${sprintMsg}!${data.assignees_not_found > 0 ? ` (${data.assignees_not_found} auto-assigned)` : ''}`);
                setCreatedTicketCount(data.tickets_created);
                
                // Refresh work items
                const itemsRes = await fetch(`${API_BASE_URL}/api/workitems/?project_id=${project.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (itemsRes.ok) {
                    setWorkItems(await itemsRes.json());
                }
                
                // Refresh sprints
                const sprintsRes = await fetch(`${API_BASE_URL}/api/workitems/projects/${project.id}/sprints`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (sprintsRes.ok) {
                    setSprints(await sprintsRes.json());
                }
                
                refreshProjectStats();
                
                // Close modal after delay
                setTimeout(() => {
                    setShowAIModal(false);
                }, 2000);
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to commit roadmap');
                setAiStep('preview');
            }
        } catch (err) {
            toast.error('Failed to commit roadmap');
            setAiStep('preview');
        } finally {
            setIsGenerating(false);
        }
    };

    // Quick status change
    const handleStatusChange = async (item: WorkItem, newStatus: string) => {
        const updated = { ...item, status: newStatus as WorkItem['status'] };
        setWorkItems(prev => prev.map(wi => wi.id === item.id ? updated : wi));
        if (selectedItem?.id === item.id) setSelectedItem(updated);
        try {
            await fetch(`${API_BASE_URL}/api/workitems/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }),
            });
            refreshProjectStats();
        } catch {
            toast.error('Failed to update status');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
                {/* Skeleton Header */}
                <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 sticky top-0 z-40">
                    <div className="px-6 py-4 flex items-center gap-4">
                        <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
                        <div className="h-8 w-48 bg-[rgba(255,255,255,0.04)] rounded-lg animate-pulse" />
                        <div className="ml-auto flex gap-2">
                            <div className="h-8 w-24 bg-[rgba(255,255,255,0.04)] rounded-lg animate-pulse" />
                            <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
                        </div>
                    </div>
                    <div className="px-6 pb-3 flex gap-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                        ))}
                    </div>
                </header>
                {/* Skeleton Board Columns */}
                <div className="flex gap-4 p-6">
                    {[...Array(4)].map((_, col) => (
                        <div key={col} className="flex-1 min-w-[260px]">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-4 w-24 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                                <div className="h-4 w-6 bg-[rgba(255,255,255,0.04)] rounded-full animate-pulse" />
                            </div>
                            <div className="space-y-3">
                                {[...Array(col === 0 ? 4 : col === 1 ? 3 : col === 2 ? 2 : 1)].map((_, i) => (
                                    <div key={i} className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-3 w-14 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                                            <div className="h-3 w-10 bg-[rgba(255,255,255,0.04)] rounded animate-pulse ml-auto" />
                                        </div>
                                        <div className="h-4 w-full bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
                                        <div className="h-3 w-3/4 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                                        <div className="flex items-center gap-2 pt-1">
                                            <div className="h-5 w-5 rounded-full bg-[rgba(255,255,255,0.06)] animate-pulse" />
                                            <div className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center text-center">
                <h2 className="text-xl font-bold text-white mb-2">Project not found</h2>
                <Button onClick={() => navigate('/')} variant="ghost" className="text-[#E0B954]">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Projects
                </Button>
            </div>
        );
    }

    // Stats
    const totalPoints = workItems.reduce((sum, i) => sum + i.story_points, 0);
    const completedCount = workItems.filter(i => i.status === 'done').length;
    const remainingHours = workItems.filter(i => i.status !== 'done').reduce((sum, i) => sum + i.remaining_hours, 0);

    return (
        <div className="min-h-screen bg-[#080808] text-[#F4F6FF] flex flex-col">
            <Toaster position="top-right" theme="dark" richColors />

            {/* Top Header */}
            <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-40">
                <div className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/')}
                            className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Projects
                        </Button>
                        <div className="w-px h-6 bg-[rgba(255,255,255,0.07)]" />
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-xs font-bold text-white">
                                {project.key_prefix.substring(0, 2)}
                            </div>
                            <div>
                                <h1 className="text-base font-semibold text-white">{project.name}</h1>
                                <p className="text-xs text-[#737373] font-mono">{project.key_prefix}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/project/${id}`)}
                            className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg"
                            title="Back to Project Overview"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowReviewer(v => !v)}
                            className={`text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2 h-9 px-3 ${showReviewer ? 'bg-[rgba(224,185,84,0.1)] text-[#E0B954]' : ''}`}
                            title="Review Mode"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            Reviewer
                        </Button>
                        <Button
                            onClick={handleAIGenerate}
                            disabled={isGenerating}
                            size="sm"
                            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 h-9"
                        >
                            {isGenerating ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                                    AI Generate
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={() => setShowCreateForm(true)}
                            size="sm"
                            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 h-9"
                        >
                            <Plus className="w-3.5 h-3.5 mr-2" />
                            New Item
                        </Button>
                    </div>
                </div>

                {/* Stats + Filters Bar */}
                <div className="px-6 py-2.5 flex items-center justify-between border-t border-[rgba(255,255,255,0.03)]">
                    <div className="flex items-center gap-6">
                        {[
                            { label: 'Items', value: workItems.length, icon: Layers },
                            { label: 'Points', value: totalPoints, icon: BarChart3 },
                            { label: 'Done', value: completedCount, icon: CheckCircle2 },
                            { label: 'Hours Left', value: `${remainingHours}h`, icon: Clock },
                        ].map(s => (
                            <div key={s.label} className="flex items-center gap-2 text-xs">
                                <s.icon className="w-3.5 h-3.5 text-[#737373]" />
                                <span className="text-[#737373]">{s.label}</span>
                                <span className="text-white font-semibold">{s.value}</span>
                            </div>
                        ))}
                    </div>
                    {/* Advanced Filter Bar */}
                    <div className="flex flex-col gap-3">
                        {/* Search & Active Filters & Add Filter & View Toggle */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
                                <Input
                                    placeholder="Search items..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-8 h-8 text-xs bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50 placeholder:text-[#334155]"
                                />
                            </div>

                            {/* Active Filter Pills */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {filterType !== 'all' && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#E0B954]/15 border border-[#E0B954]/30 rounded-full text-xs text-[#E0B954] font-medium">
                                        {TYPE_CONFIG[filterType as keyof typeof TYPE_CONFIG]?.label || filterType}
                                        <button
                                            onClick={() => setFilterType('all')}
                                            className="hover:bg-[#E0B954]/20 rounded-full p-0.5 ml-1"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {filterPriority !== 'all' && (
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[filterPriority as keyof typeof PRIORITY_COLORS]?.bg} ${PRIORITY_COLORS[filterPriority as keyof typeof PRIORITY_COLORS]?.text}`}>
                                        {filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1)}
                                        <button
                                            onClick={() => setFilterPriority('all')}
                                            className="hover:opacity-75 ml-1"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {filterAssignee !== 'all' && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#60A5FA]/15 border border-[#60A5FA]/30 rounded-full text-xs text-[#60A5FA] font-medium">
                                        {filterAssignee === 'unassigned' ? 'Unassigned' : project?.developers?.find(d => String(d.id) === filterAssignee)?.name || filterAssignee}
                                        <button
                                            onClick={() => setFilterAssignee('all')}
                                            className="hover:bg-[#60A5FA]/20 rounded-full p-0.5 ml-1"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {filterTags.map(tag => (
                                    <div key={tag} className="flex items-center gap-1.5 px-2.5 py-1 bg-[#E0B954]/15 border border-[#E0B954]/30 rounded-full text-xs text-[#E0B954] font-medium">
                                        {tag}
                                        <button
                                            onClick={() => setFilterTags(filterTags.filter(t => t !== tag))}
                                            className="hover:bg-[#E0B954]/20 rounded-full p-0.5 ml-1"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Clear All Filters */}
                            {(filterType !== 'all' || filterPriority !== 'all' || filterAssignee !== 'all' || filterTags.length > 0) && (
                                <button
                                    onClick={() => {
                                        setFilterType('all');
                                        setFilterPriority('all');
                                        setFilterAssignee('all');
                                        setFilterTags([]);
                                    }}
                                    className="text-xs text-[#737373] hover:text-red-400 underline hover:no-underline transition-colors"
                                >
                                    Clear all
                                </button>
                            )}

                            {/* Add Filter Button */}
                            <div className="relative" ref={filterMenuRef}>
                                <button
                                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                                    className="flex items-center gap-1.5 px-2.5 py-1 h-8 text-xs bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add filter
                                </button>

                                {/* Filter Menu Popover */}
                                {showFilterMenu && (
                                    <div className="absolute top-full mt-2 left-0 bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-xl shadow-2xl shadow-black/50 z-50 min-w-max">
                                        <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(255,255,255,0.05)]">
                                            <p className="text-xs font-semibold text-[#737373]">Add Filters</p>
                                            <button
                                                onClick={() => setShowFilterMenu(false)}
                                                className="p-1 rounded hover:bg-[rgba(255,255,255,0.05)] text-[#737373] hover:text-white"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div className="p-2">
                                            {/* Type Filter */}
                                            {filterType === 'all' && (
                                                <div className="px-3 py-2">
                                                    <p className="text-xs font-semibold text-[#737373] mb-2">Type</p>
                                                    <div className="space-y-1">
                                                        {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                                                            <button
                                                                key={key}
                                                                onClick={() => {
                                                                    setFilterType(key);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
                                                            >
                                                                <config.icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                                                                {config.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Priority Filter */}
                                            {filterPriority === 'all' && (
                                                <>
                                                    {filterType !== 'all' && <div className="h-px bg-[rgba(255,255,255,0.05)] my-1" />}
                                                    <div className="px-3 py-2">
                                                        <p className="text-xs font-semibold text-[#737373] mb-2">Priority</p>
                                                        <div className="space-y-1">
                                                            {Object.entries(PRIORITY_COLORS).map(([key, colors]) => (
                                                                <button
                                                                    key={key}
                                                                    onClick={() => {
                                                                        setFilterPriority(key);
                                                                    }}
                                                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors ${colors.text}`}
                                                                >
                                                                    <div className={`w-2.5 h-2.5 rounded-full ${colors.bg}`} />
                                                                    {key.charAt(0).toUpperCase() + key.slice(1)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {/* Assignee Filter */}
                                            {filterAssignee === 'all' && (project?.developers && project.developers.length > 0) && (
                                                <>
                                                    {(filterType !== 'all' || filterPriority !== 'all') && <div className="h-px bg-[rgba(255,255,255,0.05)] my-1" />}
                                                    <div className="px-3 py-2">
                                                        <p className="text-xs font-semibold text-[#737373] mb-2">Assignee</p>
                                                        {/* Search Input for Assignees */}
                                                        <div className="relative mb-2">
                                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
                                                            <input
                                                                type="text"
                                                                placeholder="Search assignees..."
                                                                value={assigneeSearchFilter}
                                                                onChange={(e) => setAssigneeSearchFilter(e.target.value)}
                                                                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50 placeholder:text-[#334155]"
                                                            />
                                                        </div>
                                                        <div className="space-y-1 max-h-56 overflow-y-auto">
                                                            <button
                                                                onClick={() => {
                                                                    setFilterAssignee('unassigned');
                                                                    setAssigneeSearchFilter('');
                                                                }}
                                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
                                                            >
                                                                <div className="w-5 h-5 rounded-full bg-[rgba(255,255,255,0.1)] flex items-center justify-center text-[10px]" />
                                                                Unassigned
                                                            </button>
                                                            {project.developers
                                                                .filter(dev => dev.name.toLowerCase().includes(assigneeSearchFilter.toLowerCase()) || dev.email.toLowerCase().includes(assigneeSearchFilter.toLowerCase()))
                                                                .map(dev => (
                                                                    <button
                                                                        key={dev.id}
                                                                        onClick={() => {
                                                                            setFilterAssignee(String(dev.id));
                                                                            setAssigneeSearchFilter('');
                                                                        }}
                                                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors"
                                                                    >
                                                                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white text-[10px] font-semibold">
                                                                            {dev.name.charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <div className="flex-1 text-left">
                                                                            <div className="text-xs font-medium">{dev.name}</div>
                                                                            <div className="text-[10px] text-[#737373]">{dev.email}</div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            {project.developers.filter(dev => dev.name.toLowerCase().includes(assigneeSearchFilter.toLowerCase()) || dev.email.toLowerCase().includes(assigneeSearchFilter.toLowerCase())).length === 0 && assigneeSearchFilter && (
                                                                <div className="px-2.5 py-2 text-xs text-[#737373] text-center">No assignees found</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {/* Tags Filter */}
                                            <div className="px-3 py-2">
                                                <p className="text-xs font-semibold text-[#737373] mb-2">Tags</p>
                                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                                    {existingTags.map(tag => (
                                                        <button
                                                            key={tag}
                                                            onClick={() => {
                                                                setFilterTags(prev => 
                                                                    prev.includes(tag) 
                                                                        ? prev.filter(t => t !== tag)
                                                                        : [...prev, tag]
                                                                );
                                                            }}
                                                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                                                                filterTags.includes(tag)
                                                                    ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                                                                    : 'text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                                                            }`}
                                                        >
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${
                                                                filterTags.includes(tag)
                                                                    ? 'bg-[#E0B954] border-[#E0B954] text-black'
                                                                    : 'border-[rgba(255,255,255,0.2)]'
                                                            }`}>
                                                                {filterTags.includes(tag) && '✓'}
                                                            </div>
                                                            {tag}
                                                        </button>
                                                    ))}
                                                    {existingTags.length === 0 && (
                                                        <div className="px-2.5 py-2 text-xs text-[#737373] text-center">No tags available</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* View Toggle */}
                            <div className="flex bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg p-0.5">
                                <button
                                    onClick={() => setViewMode('board')}
                                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'board' ? 'bg-[#E0B954] text-white' : 'text-[#737373] hover:text-white'}`}
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[#E0B954] text-white' : 'text-[#737373] hover:text-white'}`}
                            >
                                <List className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Sprint Selector */}
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedSprintId}
                                onChange={(e) => setSelectedSprintId(e.target.value === 'all' ? 'all' : e.target.value === 'backlog' ? 'backlog' : parseInt(e.target.value))}
                                className={`h-8 text-xs rounded-lg px-2.5 appearance-none cursor-pointer font-medium transition-colors ${selectedSprintId === 'all' ? 'bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white shadow-lg shadow-[#B8872A]/20' : 'bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] text-[#a3a3a3] hover:border-[rgba(244,246,255,0.12)]'}`}
                            >
                                <option value="all">All Items</option>
                                <option value="backlog">📋 Backlog</option>
                                {sprints.map(sprint => (
                                    <option key={sprint.id} value={sprint.id}>
                                        🏃 {sprint.name}
                                    </option>
                                ))}
                            </select>
                            <Button
                                onClick={() => setShowCreateSprintModal(true)}
                                size="sm"
                                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-lg shadow-[#B8872A]/20 h-8 px-3 text-xs"
                            >
                                <Plus className="w-3 h-3 mr-1" />
                                New Sprint
                            </Button>
                        </div>
                    </div>
                    </div>
                </div>
            </header>

            {/* Board Content */}
            <div className="flex-1 overflow-x-auto">
                {viewMode === 'board' ? (
                    /* KANBAN BOARD VIEW */
                    <div className="flex gap-4 p-6 min-h-[calc(100vh-140px)]">
                        {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => {
                            const config = STATUS_CONFIG[status];
                            const columnItems = filteredItems.filter(item => item.status === status);
                            const isDropTarget = dragOverColumn === status;

                            return (
                                <div
                                    key={status}
                                    className={`flex-1 min-w-[280px] max-w-[360px] flex flex-col rounded-2xl border transition-all duration-200 ${isDropTarget
                                        ? 'border-[#E0B954]/40 bg-[#E0B954]/5 shadow-lg shadow-[#E0B954]/10'
                                        : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]'
                                        }`}
                                    onDragOver={(e) => handleDragOver(e, status)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, status)}
                                >
                                    {/* Column Header */}
                                    <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between flex-shrink-0">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color, boxShadow: `0 0 8px ${config.color}44` }} />
                                            <span className="font-semibold text-sm text-white">{config.label}</span>
                                        </div>
                                        <Badge className="bg-[rgba(255,255,255,0.05)] text-[#737373] border-0 text-xs font-medium px-2 py-0.5">
                                            {columnItems.length}
                                        </Badge>
                                    </div>

                                    {/* Cards */}
                                    <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
                                        {columnItems.map((item) => {
                                            const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
                                            const TypeIcon = typeInfo.icon;
                                            const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
                                            const hoursProgress = item.assigned_hours > 0
                                                ? ((item.assigned_hours - item.remaining_hours) / item.assigned_hours) * 100
                                                : 0;

                                            return (
                                                <div
                                                    key={item.id}
                                                    draggable
                                                    onDragStart={() => handleDragStart(item.id)}
                                                    onMouseEnter={() => prefetchComments(item.id)}
                                                    onClick={() => { navigate(`/project/${id}/board/${item.id}`); setIsEditing(false); setEditForm({}); }}
                                                    className={`group bg-[rgba(255,255,255,0.025)] rounded-xl border border-[rgba(255,255,255,0.05)] p-3.5 cursor-pointer transition-all duration-200 hover:border-[rgba(244,246,255,0.15)] hover:bg-[rgba(244,246,255,0.05)] hover:shadow-lg hover:shadow-black/20 ${draggedItem === item.id ? 'opacity-40 scale-95' : ''
                                                        }`}
                                                >
                                                    {/* Type + Key */}
                                                    <div className="flex items-center gap-2 mb-2.5">
                                                        <div
                                                            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                                                            style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
                                                        >
                                                            <TypeIcon className="w-3 h-3" />
                                                            {typeInfo.label}
                                                        </div>
                                                        <span className="text-[10px] text-[#E0B954] font-mono font-medium">{item.key}</span>
                                                    </div>

                                                    {/* Title */}
                                                    <h4 className="text-sm font-medium text-[#f5f5f5] mb-3 line-clamp-2 leading-snug">
                                                        {item.title}
                                                    </h4>

                                                    {/* Progress Bar */}
                                                    <div className="mb-3">
                                                        <div className="flex justify-between text-[10px] text-[#737373] mb-1">
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="w-2.5 h-2.5" />
                                                                {item.remaining_hours}h left
                                                            </span>
                                                            <span className="flex items-center gap-2">
                                                                <span className="text-[#E0B954]">{item.logged_hours || 0}h logged</span>
                                                                <span>/ {item.assigned_hours}h</span>
                                                            </span>
                                                        </div>
                                                        <div className="h-1 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full transition-all duration-500"
                                                                style={{
                                                                    width: `${hoursProgress}%`,
                                                                    background: `linear-gradient(90deg, ${config.color}, ${config.color}AA)`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Bottom: Points + Priority + Assignee */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-md bg-[#E0B954]/15 flex items-center justify-center">
                                                                <span className="text-[10px] font-bold text-[#E0B954]">{item.story_points}</span>
                                                            </div>
                                                            <Badge
                                                                variant="outline"
                                                                className={`text-[10px] px-1.5 py-0 h-5 ${priorityStyle.border} ${priorityStyle.text}`}
                                                            >
                                                                {item.priority}
                                                            </Badge>
                                                        </div>
                                                        {item.assignee && item.assignee !== 'Unassigned' && (
                                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center" title={item.assignee}>
                                                                <span className="text-[10px] font-semibold text-white">
                                                                    {item.assignee?.charAt?.(0)?.toUpperCase() || '?'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Tags */}
                                                    {item.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {item.tags.slice(0, 2).map(tag => (
                                                                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] text-[#737373]">{tag}</span>
                                                            ))}
                                                            {item.tags.length > 2 && (
                                                                <span className="text-[9px] text-[#737373]">+{item.tags.length - 2}</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* This Week Time Entries Table */}
                                                    <TimeEntriesTable workItemId={item.id} token={token || ''} />
                                                </div>
                                            );
                                        })}

                                        {/* Empty state */}
                                        {columnItems.length === 0 && (
                                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                                <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.03)] flex items-center justify-center mb-2">
                                                    <config.icon className="w-5 h-5 text-[#334155]" />
                                                </div>
                                                <p className="text-xs text-[#334155]">No items</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* LIST VIEW */
                    <div className="p-6">
                        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3 border-b border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                                <span>Title</span>
                                <span>Type</span>
                                <span>Status</span>
                                <span>Priority</span>
                                <span>Points</span>
                                <span>Assignee</span>
                            </div>
                            {/* Table Rows */}
                            {filteredItems.length === 0 ? (
                                <div className="py-16 text-center text-[#737373] text-sm">No items found</div>
                            ) : (
                                filteredItems.map(item => {
                                    const typeInfo = TYPE_CONFIG[item.type] || TYPE_CONFIG.task;
                                    const TypeIcon = typeInfo.icon;
                                    const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.todo;
                                    const priorityStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;

                                    return (
                                        <div
                                            key={item.id}
                                            onMouseEnter={() => prefetchComments(item.id)}
onClick={() => { navigate(`/project/${id}/board/${item.id}`); setIsEditing(false); setEditForm({}); }}
                                            className="grid grid-cols-[1fr_120px_100px_100px_100px_120px] gap-4 px-5 py-3.5 border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="text-[10px] text-[#E0B954] font-mono font-medium shrink-0">{item.key}</span>
                                                <span className="text-sm text-[#f5f5f5] truncate group-hover:text-white transition-colors">{item.title}</span>
                                            </div>
                                            <div className="flex items-center">
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs" style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}>
                                                    <TypeIcon className="w-3 h-3" />
                                                    {typeInfo.label}
                                                </div>
                                            </div>
                                            <div className="flex items-center">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusConf.color }} />
                                                    <span className="text-xs text-[#a3a3a3]">{statusConf.label}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center">
                                                <Badge variant="outline" className={`text-[10px] ${priorityStyle.border} ${priorityStyle.text}`}>
                                                    {item.priority}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center">
                                                <span className="text-sm font-semibold text-[#E0B954]">{item.story_points}</span>
                                            </div>
                                            <div className="flex items-center">
                                                <span className="text-xs text-[#737373] truncate">{item.assignee}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Slide-in Drawer */}
            {selectedItem && (
                <>
                    <div className="fixed inset-0 bg-black/40 z-40" onClick={() => navigate(`/project/${id}/board`)} />
                    <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50 animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <div className="flex items-center gap-3">
                                {(() => {
                                    const ti = TYPE_CONFIG[selectedItem.type] || TYPE_CONFIG.task;
                                    return (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium"
                                            style={{ backgroundColor: ti.bg, color: ti.color }}>
                                            <ti.icon className="w-4 h-4" />
                                            {ti.label}
                                        </div>
                                    );
                                })()}
                                <span className="text-sm text-[#737373] font-mono">{selectedItem.id}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => { setIsEditing(!isEditing); if (!isEditing) setEditForm(selectedItem); }}
                                    className="text-[#737373] hover:text-white rounded-lg h-8 px-2.5">
                                    <Pencil className="w-3.5 h-3.5 mr-1" />{isEditing ? 'Cancel' : 'Edit'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(selectedItem.id)}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg h-8 px-2.5">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => navigate(`/project/${id}/board`)}
                                    className="text-[#737373] hover:text-white rounded-lg h-8 px-2.5">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Drawer Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6">
                            {isEditing ? (
                                /* Edit Form */
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
                                        <Input defaultValue={selectedItem.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                                            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
                                        <Textarea defaultValue={selectedItem.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                                            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
                                            <select defaultValue={selectedItem.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as WorkItem['type'] }))}
                                                className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm">
                                                <option value="user_story">Story</option>
                                                <option value="task">Task</option>
                                                <option value="bug">Bug</option>
                                                <option value="epic">Epic</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-[#737373] block mb-1.5">Priority</label>
                                            <select defaultValue={selectedItem.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value as WorkItem['priority'] }))}
                                                className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm">
                                                <option value="critical">Critical</option>
                                                <option value="high">High</option>
                                                <option value="medium">Medium</option>
                                                <option value="low">Low</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-[#737373] block mb-1.5">Story Points</label>
                                            <Input type="number" defaultValue={selectedItem.story_points} onChange={e => setEditForm(f => ({ ...f, story_points: parseInt(e.target.value) || 0 }))}
                                                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-[#737373] block mb-1.5">Allocated Hours</label>
                                            <Input type="number" defaultValue={selectedItem.assigned_hours} onChange={e => setEditForm(f => ({ ...f, assigned_hours: parseInt(e.target.value) || 0 }))}
                                                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-[#737373] block mb-1.5">Logged Hours</label>
                                            <Input type="number" defaultValue={selectedItem.logged_hours || 0} onChange={e => setEditForm(f => ({ ...f, logged_hours: parseInt(e.target.value) || 0 }))}
                                                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-[#737373] block mb-1.5">Remaining Hours</label>
                                            <Input type="number" defaultValue={selectedItem.remaining_hours} onChange={e => setEditForm(f => ({ ...f, remaining_hours: parseInt(e.target.value) || 0 }))}
                                                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
                                        <select
                                            value={editForm.assignee_id ?? selectedItem.assignee_id ?? ''}
                                            onChange={e => setEditForm(f => ({ ...f, assignee_id: e.target.value ? parseInt(e.target.value) : null }))}
                                            className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
                                        >
                                            <option value="">Unassigned</option>
                                            {project?.developers?.map(dev => (
                                                <option key={dev.id} value={dev.id}>
                                                    {dev.name} ({dev.role})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint</label>
                                        <Input defaultValue={selectedItem.sprint} onChange={e => setEditForm(f => ({ ...f, sprint: e.target.value }))}
                                            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date</label>
                                            <Popover open={showCalendarEditForm} onOpenChange={setShowCalendarEditForm}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10"
                                                    >
                                                        <Calendar className="w-4 h-4 mr-2" />
                                                        {editForm.due_date ? parseLocalDate(editForm.due_date as string)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]" align="start">
                                                    <CalendarIcon
                                                        mode="single"
                                                        selected={parseLocalDate(editForm.due_date === '' || !editForm.due_date ? undefined : editForm.due_date as string)}
                                                        onSelect={(date) => {
                                                            if (date) {
                                                                const year = date.getFullYear();
                                                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                                                const day = String(date.getDate()).padStart(2, '0');
                                                                setEditForm({ ...editForm, due_date: `${year}-${month}-${day}` });
                                                                setShowCalendarEditForm(false);
                                                            }
                                                        }}
                                                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                                        classNames={{
                                                            months: "flex flex-col",
                                                            month: "space-y-4",
                                                            caption: "flex justify-between items-center px-0 pb-4 relative h-7 mb-2",
                                                            caption_label: "text-sm font-medium text-white",
                                                            nav: "space-x-1 flex items-center",
                                                            nav_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1",
                                                            nav_button_previous: "absolute left-0",
                                                            nav_button_next: "absolute right-0",
                                                            table: "w-full border-collapse space-y-1",
                                                            head_row: "flex",
                                                            head_cell: "text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded",
                                                            row: "flex w-full gap-1",
                                                            cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent",
                                                            day: "h-8 w-8 p-0 font-normal",
                                                            day_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors",
                                                            day_selected: "bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold",
                                                            day_today: "bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold",
                                                            day_outside: "text-[#444]",
                                                            day_disabled: "text-[#333] opacity-50 cursor-not-allowed",
                                                            day_range_middle: "aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white",
                                                            day_hidden: "invisible",
                                                        }}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={handleSaveEdit}
                                        disabled={isSavingEdit}
                                        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl w-full h-10 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isSavingEdit ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4 mr-2" /> Save Changes
                                            </>
                                        )}
                                    </Button>
                                </div>
                            ) : (
                                /* View Mode */
                                <>
                                    <div>
                                        <h2 className="text-xl font-bold text-white mb-3">{selectedItem.title}</h2>
                                        <p className="text-sm text-[#a3a3a3] leading-relaxed whitespace-pre-wrap">{renderTextWithNewlines(selectedItem.description) || 'No description provided.'}</p>
                                    </div>

                                    {/* Detail Stats */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: 'Story Points', value: selectedItem.story_points, color: '#E0B954' },
                                            { label: 'Allocated Hours', value: `${selectedItem.assigned_hours}h`, color: '#E0B954' },
                                            { label: 'Logged Hours', value: `${selectedItem.logged_hours || 0}h`, color: '#E0B954' },
                                            { label: 'Remaining Hours', value: `${selectedItem.remaining_hours}h`, color: '#F59E0B' },
                                            { label: 'Due Date', value: selectedItem.due_date ? (parseLocalDate(selectedItem.due_date)?.toLocaleDateString() ?? 'Not set') : 'Not set', color: selectedItem.due_date ? '#E0B954' : '#737373' },
                                            { label: 'Status', value: (STATUS_CONFIG[selectedItem.status] || STATUS_CONFIG.todo).label, color: (STATUS_CONFIG[selectedItem.status] || STATUS_CONFIG.todo).color },
                                            { label: 'Priority', value: selectedItem.priority.charAt(0).toUpperCase() + selectedItem.priority.slice(1), color: (PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium).text.replace('text-', '').includes('red') ? '#EF4444' : (PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium).text.includes('orange') ? '#F97316' : (PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.medium).text.includes('yellow') ? '#F59E0B' : '#E0B954' },
                                        ].map(d => (
                                            <div key={d.label} className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3.5">
                                                <div className="text-[10px] text-[#737373] font-medium uppercase tracking-wider mb-1">{d.label}</div>
                                                <div className="text-lg font-bold" style={{ color: d.color }}>{d.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Metadata */}
                                    <div className="space-y-3">
                                        {[
                                            { label: 'Assignee', value: selectedItem.assignee },
                                            { label: 'Sprint', value: selectedItem.sprint },
                                            ...(selectedItem.epic ? [{ label: 'Epic', value: selectedItem.epic }] : []),
                                        ].map(m => (
                                            <div key={m.label} className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.03)]">
                                                <span className="text-xs text-[#737373]">{m.label}</span>
                                                <span className="text-sm text-[#f5f5f5]">{m.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Hierarchy breadcrumb */}
                                    {(selectedItem.epic_key || selectedItem.parent_key) && (() => {
                                        const parentItem = selectedItem.parent_id ? workItems.find(wi => wi.id === selectedItem.parent_id?.toString()) : null;
                                        const epicItem = selectedItem.epic_id ? workItems.find(wi => wi.id === selectedItem.epic_id?.toString()) : null;
                                        return (
                                            <div>
                                                <div className="text-xs text-[#737373] mb-2 font-medium">Hierarchy</div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {selectedItem.epic_key && epicItem && (
                                                        <a href={`/project/${id}/board/${epicItem.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(167,139,250,0.12)] text-[#A78BFA] text-xs hover:bg-[rgba(167,139,250,0.2)] transition-colors cursor-pointer">
                                                            Epic: {selectedItem.epic_key} ({epicItem.title})
                                                        </a>
                                                    )}
                                                    {selectedItem.epic_key && selectedItem.parent_key && <span className="text-[#555] text-xs">›</span>}
                                                    {selectedItem.parent_key && parentItem && (
                                                        <a href={`/project/${id}/board/${parentItem.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(224,185,84,0.10)] text-[#E0B954] text-xs hover:bg-[rgba(224,185,84,0.2)] transition-colors cursor-pointer">
                                                            Parent: {selectedItem.parent_key} ({parentItem.title})
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Child items */}
                                    {(() => {
                                        const children = workItems.filter(wi => wi.parent_id === parseInt(selectedItem.id));
                                        return children.length > 0 ? (
                                            <div>
                                                <div className="text-xs text-[#737373] mb-2 font-medium">Child Items ({children.length})</div>
                                                <div className="space-y-1.5">
                                                    {children.map(child => (
                                                        <div
                                                            key={child.id}
                                                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] cursor-pointer hover:border-[rgba(255,255,255,0.08)] transition-colors"
                                                            onClick={() => navigate(`/project/${id}/board/${child.id}`)}
                                                        >
                                                            <span className="text-xs font-mono text-[#737373] flex-shrink-0">{child.key}</span>
                                                            <span className="text-sm text-[#a3a3a3] truncate flex-1">{child.title}</span>
                                                            <span className="text-xs text-[#555] capitalize flex-shrink-0">{child.status.replace(/_/g, ' ')}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null;
                                    })()}

                                    {/* Tags */}
                                    {selectedItem.tags.length > 0 && (
                                        <div>
                                            <div className="text-xs text-[#737373] mb-2 font-medium">Tags</div>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedItem.tags.map(tag => (
                                                    <span key={tag} className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Log Hours Section */}
                                    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                        <div className="text-xs text-[#737373] mb-3 font-medium">Log Work Hours</div>
                                        <div className="flex items-center gap-3">
                                            <Input
                                                type="number"
                                                placeholder="Hours"
                                                min="0"
                                                className="w-24 h-9 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                                                id="log-hours-input"
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    const input = document.getElementById('log-hours-input') as HTMLInputElement;
                                                    const hours = parseInt(input?.value || '0');
                                                    if (hours > 0) {
                                                        handleLogHours(selectedItem, hours);
                                                        input.value = '';
                                                    }
                                                }}
                                                className="bg-[#E0B954] hover:bg-[#C79E3B] text-white rounded-xl h-9"
                                            >
                                                <Clock className="w-3.5 h-3.5 mr-1.5" />
                                                Log Hours
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-[#737373] mt-2">
                                            Current: {selectedItem.logged_hours || 0}h logged · {selectedItem.remaining_hours}h remaining
                                        </p>
                                    </div>

                                    {/* Status Buttons */}
                                    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                        <div className="text-xs text-[#737373] mb-3 font-medium">Move to</div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(status => (
                                                <Button
                                                    key={status}
                                                    size="sm"
                                                    onClick={() => handleStatusChange(selectedItem, status)}
                                                    className={`rounded-lg text-xs h-9 transition-all ${selectedItem.status === status
                                                        ? 'text-white shadow-lg'
                                                        : 'bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]'
                                                        }`}
                                                    style={selectedItem.status === status ? { backgroundColor: STATUS_CONFIG[status].color, boxShadow: `0 4px 12px ${STATUS_CONFIG[status].color}33` } : {}}
                                                >
                                                    {STATUS_CONFIG[status].label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Sprint Movement */}
                                    {sprints.length > 0 && (
                                        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                            <div className="text-xs text-[#737373] mb-3 font-medium">Sprint Actions</div>
                                            <div className="flex flex-wrap gap-2">
                                                {/* Move to next sprint */}
                                                {selectedItem.sprint_id && getNextSprint(selectedItem.sprint_id) && selectedItem.status !== 'done' && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleMoveToSprint(selectedItem.id, getNextSprint(selectedItem.sprint_id))}
                                                        className="rounded-lg text-xs h-9 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-[#F59E0B] hover:bg-[rgba(245,158,11,0.2)]"
                                                    >
                                                        <ArrowRight className="w-3 h-3 mr-1" />
                                                        Push to Next Sprint
                                                    </Button>
                                                )}
                                                {/* Move to backlog */}
                                                {selectedItem.sprint_id && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleMoveToSprint(selectedItem.id, null)}
                                                        className="rounded-lg text-xs h-9 bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]"
                                                    >
                                                        <Inbox className="w-3 h-3 mr-1" />
                                                        Move to Backlog
                                                    </Button>
                                                )}
                                                {/* Move to sprint dropdown */}
                                                {!selectedItem.sprint_id && (
                                                    <select
                                                        onChange={(e) => {
                                                            if (e.target.value) {
                                                                handleMoveToSprint(selectedItem.id, parseInt(e.target.value));
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                        className="h-9 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#a3a3a3] rounded-lg px-3 appearance-none cursor-pointer hover:border-[rgba(244,246,255,0.15)]"
                                                        defaultValue=""
                                                    >
                                                        <option value="">Add to Sprint...</option>
                                                        {sprints.map(sprint => (
                                                            <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Child Items (if this is an Epic) */}
                                    {selectedItem.type === 'epic' && (() => {
                                        const childItems = workItems.filter(wi => wi.epic_id === parseInt(selectedItem.id));
                                        return childItems.length > 0 ? (
                                            <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                                <div className="text-xs text-[#737373] mb-3 font-medium">Child Items ({childItems.length})</div>
                                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                                    {childItems.map(child => {
                                                        const childTypeInfo = TYPE_CONFIG[child.type] || TYPE_CONFIG.task;
                                                        const childPriorityStyle = PRIORITY_COLORS[child.priority] || PRIORITY_COLORS.medium;
                                                        return (
                                                            <a
                                                                key={child.id}
                                                                href={`/project/${id}/board/${child.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="block p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(244,246,255,0.15)] cursor-pointer transition-all"
                                                            >
                                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                                    <div className="flex items-center gap-2 flex-1">
                                                                        <div
                                                                            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0"
                                                                            style={{ backgroundColor: childTypeInfo.bg, color: childTypeInfo.color }}
                                                                        >
                                                                            <childTypeInfo.icon className="w-2.5 h-2.5" />
                                                                            {childTypeInfo.label}
                                                                        </div>
                                                                        <span className="text-[9px] text-[#E0B954] font-mono">{child.key}</span>
                                                                    </div>
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={`text-[9px] px-1 py-0 h-5 flex-shrink-0 ${childPriorityStyle.border} ${childPriorityStyle.text}`}
                                                                    >
                                                                        {child.priority}
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-xs text-[#a3a3a3] line-clamp-1 mb-1.5">{child.title}</p>
                                                                <div className="flex items-center justify-between text-[9px] text-[#737373]">
                                                                    <span>{child.remaining_hours}h left</span>
                                                                    <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ backgroundColor: `${(STATUS_CONFIG[child.status] || STATUS_CONFIG.todo).color}22`, color: (STATUS_CONFIG[child.status] || STATUS_CONFIG.todo).color }}>
                                                                        {(STATUS_CONFIG[child.status] || STATUS_CONFIG.todo).label}
                                                                    </span>
                                                                </div>
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : null;
                                    })()}

                                    {/* Comments Section */}
                                    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
                                        <div className="text-xs text-[#737373] mb-3 font-medium">Activity & Comments</div>
                                        
                                        {/* Comment Input */}
                                        <div className="relative mb-4">
                                            <Textarea
                                                value={newComment}
                                                onChange={handleCommentChange}
                                                placeholder="Add a comment... Use @ to mention someone"
                                                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none pr-20"
                                            />
                                            {/* @Mentions Dropdown */}
                                            {showMentions && (
                                                <div className="absolute left-0 right-0 top-full mt-1 bg-[#1A1D26] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                                                    {allDevelopers
                                                        .filter(d => d.name.toLowerCase().includes(mentionFilter.toLowerCase()))
                                                        .slice(0, 5)
                                                        .map(dev => (
                                                            <button
                                                                key={dev.id}
                                                                onClick={() => insertMention(dev)}
                                                                className="w-full px-3 py-2 text-left text-sm text-[#f5f5f5] hover:bg-[rgba(224,185,84,0.1)] flex items-center gap-2"
                                                            >
                                                                <div className="w-6 h-6 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-xs text-[#E0B954]">
                                                                    {dev.name.charAt(0).toUpperCase()}
                                                                </div>
                                                                <span>{dev.name}</span>
                                                                <span className="text-[#737373] text-xs ml-auto">{dev.email}</span>
                                                            </button>
                                                        ))}
                                                    {allDevelopers.filter(d => d.name.toLowerCase().includes(mentionFilter.toLowerCase())).length === 0 && (
                                                        <div className="px-3 py-2 text-sm text-[#737373]">No matching developers</div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex gap-2 mt-2 flex-wrap">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSubmitComment('comment')}
                                                    disabled={!newComment.trim()}
                                                    className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] rounded-lg text-xs h-8"
                                                >
                                                    <MessageSquare className="w-3 h-3 mr-1" />
                                                    Comment
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSubmitComment('blocker')}
                                                    disabled={!newComment.trim()}
                                                    className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.2)] rounded-lg text-xs h-8"
                                                >
                                                    <AlertCircle className="w-3 h-3 mr-1" />
                                                    Report Blocker
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSubmitComment('business_review')}
                                                    disabled={!newComment.trim()}
                                                    className="bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.3)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.2)] rounded-lg text-xs h-8"
                                                >
                                                    <Target className="w-3 h-3 mr-1" />
                                                    Business Review
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Comments List */}
                                        <div className="space-y-3 max-h-64 overflow-y-auto">
                                            {comments.length === 0 ? (
                                                <div className="text-center py-6 text-[#737373] text-sm">
                                                    No comments yet. Be the first to comment!
                                                </div>
                                            ) : (
                                                comments.map(comment => (
                                                    <div key={comment.id} className={`p-3 rounded-xl ${
                                                        comment.comment_type === 'blocker' 
                                                            ? 'bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)]'
                                                            : comment.comment_type === 'business_review'
                                                            ? 'bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.2)]'
                                                            : 'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]'
                                                    }`}>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                                                comment.comment_type === 'blocker' 
                                                                    ? 'bg-[rgba(239,68,68,0.2)] text-[#EF4444]'
                                                                    : comment.comment_type === 'business_review'
                                                                    ? 'bg-[rgba(167,139,250,0.2)] text-[#A78BFA]'
                                                                    : 'bg-[rgba(224,185,84,0.2)] text-[#E0B954]'
                                                            }`}>
                                                                {comment.author_name?.charAt?.(0)?.toUpperCase() || '?'}
                                                            </div>
                                                            <span className="text-sm font-medium text-[#f5f5f5]">{comment.author_name}</span>
                                                            {comment.comment_type === 'blocker' && (
                                                                <span className="px-1.5 py-0.5 rounded-md bg-[rgba(239,68,68,0.2)] text-[#EF4444] text-[10px] font-medium">BLOCKER</span>
                                                            )}
                                                            {comment.comment_type === 'business_review' && (
                                                                <span className="px-1.5 py-0.5 rounded-md bg-[rgba(167,139,250,0.2)] text-[#A78BFA] text-[10px] font-medium">BUSINESS REVIEW</span>
                                                            )}
                                                            <span className="text-xs text-[#737373] ml-auto">
                                                                {new Date(comment.created_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-[#a3a3a3] leading-relaxed">
                                                            {renderCommentContent(comment.content, comment.mentions)}
                                                        </p>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>


                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Create Item Modal */}
            {showCreateForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => handleCloseCreateForm()}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
                            <h2 className="text-lg font-bold text-white">Create Work Item</h2>
                            <button onClick={() => handleCloseCreateForm()} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
                                <select value={createForm.type} onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))}
                                    className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm">
                                    <option value="user_story">User Story</option>
                                    <option value="task">Task</option>
                                    <option value="bug">Bug</option>
                                    <option value="epic">Epic</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Title *</label>
                                <Input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="Enter a concise title..."
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
                                <Textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="Describe the requirements..."
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[100px] placeholder:text-[#334155] resize-none whitespace-pre-wrap" />
                            </div>
                            <div className={createForm.type === 'task' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'}>
                                <div>
                                    <label className="text-xs font-medium text-[#737373] block mb-1.5">Priority</label>
                                    <select value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))}
                                        className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm">
                                        <option value="critical">Critical</option>
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                                {createForm.type !== 'task' && (
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Points</label>
                                        <Input type="number" value={createForm.story_points} onChange={e => setCreateForm(f => ({ ...f, story_points: parseInt(e.target.value) || 0 }))}
                                            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10" />
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
                                    <select
                                        value={createForm.assignee_id || ''}
                                        onChange={e => setCreateForm(f => ({ ...f, assignee_id: e.target.value ? parseInt(e.target.value) : null }))}
                                        className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
                                    >
                                        <option value="">Unassigned</option>
                                        {project?.developers?.map(dev => (
                                            <option key={dev.id} value={dev.id}>
                                                {dev.name} ({dev.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {createForm.type !== 'task' && (
                                /* Hierarchy - Hidden for Tasks */
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Epic (optional)</label>
                                        <select
                                            value={createForm.epic_id || ''}
                                            onChange={e => setCreateForm(f => ({ ...f, epic_id: e.target.value ? parseInt(e.target.value) : null }))}
                                            className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                                        >
                                            <option value="">No Epic</option>
                                            {workItems.filter(wi => wi.type === 'epic').map(wi => (
                                                <option key={wi.id} value={wi.id}>{wi.key} — {wi.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Parent Story (optional)</label>
                                        <select
                                            value={createForm.parent_id || ''}
                                            onChange={e => setCreateForm(f => ({ ...f, parent_id: e.target.value ? parseInt(e.target.value) : null }))}
                                            className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                                        >
                                            <option value="">No Parent</option>
                                            {workItems.filter(wi => wi.type === 'user_story').map(wi => (
                                                <option key={wi.id} value={wi.id}>{wi.key} — {wi.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                            {createForm.type === 'task' && (
                                /* Tags section for Tasks */
                                <div className="p-3 rounded-lg bg-[rgba(224,185,84,0.08)] border border-[rgba(224,185,84,0.2)]">
                                    <label className="text-xs font-medium text-[#E0B954] block mb-1.5">Tags (Optional)</label>
                                    <p className="text-[10px] text-[#737373] mb-2">Organize tasks with tags. Type a new tag or select from existing ones.</p>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={tagInput}
                                            onChange={(e) => {
                                                setTagInput(e.target.value);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && tagInput.trim()) {
                                                    e.preventDefault();
                                                    const newTag = tagInput.trim().toLowerCase();
                                                    if (!createForm.tags?.includes(newTag)) {
                                                        setCreateForm(f => {
                                                            const updatedTags = [...(f.tags || []), newTag];
                                                            return { ...f, tags: updatedTags };
                                                        });
                                                    }
                                                    setTagInput('');
                                                }
                                            }}
                                            placeholder="Type tag and press Enter"
                                            className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 px-3 placeholder:text-[#334155] focus:outline-none focus:border-[#E0B954]/50"
                                        />
                                    </div>
                                    {/* Suggested existing tags */}
                                    {existingTags.length > 0 && (
                                        <div className="mb-2">
                                            <p className="text-[10px] text-[#E0B954] font-medium mb-1.5">Available Tags ({existingTags.length}):</p>
                                            <div className="flex flex-wrap gap-2">
                                                {existingTags.filter(t => !createForm.tags?.includes(t)).map(tag => (
                                                    <button
                                                        key={tag}
                                                        onClick={() => {
                                                            setCreateForm(f => {
                                                                const updated = [...(f.tags || []), tag];
                                                                return { ...f, tags: updated };
                                                            });
                                                        }}
                                                        className="px-3 py-1 rounded-lg bg-[rgba(224,185,84,0.15)] border border-[rgba(224,185,84,0.4)] text-[#E0B954] text-xs hover:bg-[rgba(224,185,84,0.25)] transition-colors cursor-pointer font-medium"
                                                    >
                                                        + {tag}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {existingTags.length === 0 && (
                                        <div className="mb-2 p-2 rounded bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.15)]">
                                            <p className="text-[10px] text-[#737373]">No existing tags yet. Create new ones by typing and pressing Enter!</p>
                                        </div>
                                    )}
                                    {/* Selected tags */}
                                    {createForm.tags && createForm.tags.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-[#737373] mb-1.5 font-medium">Selected Tags ({createForm.tags.length}):</p>
                                            <div className="flex flex-wrap gap-2">
                                                {createForm.tags.map(tag => (
                                                    <div key={tag} className="px-2.5 py-1 rounded-lg bg-[rgba(224,185,84,0.2)] border border-[rgba(224,185,84,0.4)] text-[#E0B954] text-xs flex items-center gap-1.5 font-medium">
                                                        {tag}
                                                        <button
                                                            onClick={() => {
                                                                setCreateForm(f => {
                                                                    const updated = f.tags?.filter(t => t !== tag) || [];
                                                                    return { ...f, tags: updated };
                                                                });
                                                            }}
                                                            className="text-[#E0B954] hover:text-white ml-0.5"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Due Date and Estimated Hours */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date (optional)</label>
                                    <Popover open={showCalendarCreateForm} onOpenChange={setShowCalendarCreateForm}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10"
                                            >
                                                <Calendar className="w-4 h-4 mr-2" />
                                                {createForm.due_date ? parseLocalDate(createForm.due_date as string)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]" align="start">
                                            <CalendarIcon
                                                mode="single"
                                                selected={parseLocalDate(createForm.due_date === '' ? undefined : createForm.due_date as string)}
                                                onSelect={(date) => {
                                                    if (date) {
                                                        const year = date.getFullYear();
                                                        const month = String(date.getMonth() + 1).padStart(2, '0');
                                                        const day = String(date.getDate()).padStart(2, '0');
                                                        setCreateForm({ ...createForm, due_date: `${year}-${month}-${day}` });
                                                        setShowCalendarCreateForm(false);
                                                    }
                                                }}
                                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                                classNames={{
                                                    months: "flex flex-col",
                                                    month: "space-y-4",
                                                    caption: "flex justify-between items-center px-0 pb-4 relative h-7 mb-2",
                                                    caption_label: "text-sm font-medium text-white",
                                                    nav: "space-x-1 flex items-center",
                                                    nav_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1",
                                                    nav_button_previous: "absolute left-0",
                                                    nav_button_next: "absolute right-0",
                                                    table: "w-full border-collapse space-y-1",
                                                    head_row: "flex",
                                                    head_cell: "text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded",
                                                    row: "flex w-full gap-1",
                                                    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent",
                                                    day: "h-8 w-8 p-0 font-normal",
                                                    day_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors",
                                                    day_selected: "bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold",
                                                    day_today: "bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold",
                                                    day_outside: "text-[#444]",
                                                    day_disabled: "text-[#333] opacity-50 cursor-not-allowed",
                                                    day_range_middle: "aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white",
                                                    day_hidden: "invisible",
                                                }}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[#737373] block mb-1.5">Est. Hours</label>
                                    <Input 
                                        type="number" 
                                        min="1"
                                        value={createForm.estimated_hours} 
                                        onChange={e => setCreateForm(f => ({ ...f, estimated_hours: e.target.value }))}
                                        placeholder="Hours"
                                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
                            <Button variant="ghost" onClick={() => handleCloseCreateForm()} className="text-[#737373] rounded-xl px-5" disabled={isCreatingItem}>Cancel</Button>
                            <Button onClick={handleCreateItem} disabled={!createForm.title.trim() || isCreatingItem}
                                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                                title={!createForm.title.trim() ? "Title is required" : ""}>
                                {isCreatingItem ? (
                                    <>
                                        <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4 mr-2" /> Create Item
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Planning Modal */}
            {showAIModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Project Planning</h2>
                                    <p className="text-xs text-[#737373]">
                                        {aiStep === 'upload' && 'Upload PRD or enter project details'}
                                        {aiStep === 'analyzing' && 'Analyzing project requirements...'}
                                        {aiStep === 'architectures' && 'Select your preferred architecture'}
                                        {aiStep === 'preview' && 'Review generated tickets'}
                                        {aiStep === 'committing' && 'Creating tickets...'}
                                        {aiStep === 'done' && 'Tickets created successfully!'}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowAIModal(false)} 
                                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {/* Step: Upload */}
                            {aiStep === 'upload' && (
                                <div className="space-y-6">
                                    {/* Upload Mode Toggle */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setUploadMode('prd')}
                                            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                                                uploadMode === 'prd'
                                                    ? 'bg-[#E0B954] text-black'
                                                    : 'bg-[rgba(255,255,255,0.08)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.12)]'
                                            }`}
                                        >
                                            PRD Document
                                        </button>
                                        <button
                                            onClick={() => setUploadMode('roadmap')}
                                            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                                                uploadMode === 'roadmap'
                                                    ? 'bg-[#E0B954] text-black'
                                                    : 'bg-[rgba(255,255,255,0.08)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.12)]'
                                            }`}
                                        >
                                            Roadmap File
                                        </button>
                                    </div>

                                    {/* PRD Mode */}
                                    {uploadMode === 'prd' && (
                                        <div className="space-y-6">
                                        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Upload PRD Document</label>
                                        <div 
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                                                prdFile 
                                                    ? 'border-[#E0B954] bg-[#E0B954]/5' 
                                                    : 'border-[rgba(255,255,255,0.08)] hover:border-[#E0B954]/50 hover:bg-[rgba(255,255,255,0.02)]'
                                            }`}
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".pdf,.doc,.docx,.txt"
                                                onChange={handleFileUpload}
                                                className="hidden"
                                            />
                                            {prdFile ? (
                                                <div className="flex items-center justify-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl bg-[#E0B954]/20 flex items-center justify-center">
                                                        <FileText className="w-6 h-6 text-[#E0B954]" />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-white font-medium">{prdFile.name}</p>
                                                        <p className="text-xs text-[#737373]">{(prdFile.size / 1024).toFixed(1)} KB</p>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setPrdFile(null); }}
                                                        className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-red-400"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <Upload className="w-10 h-10 text-[#737373] mx-auto mb-3" />
                                                    <p className="text-[#a3a3a3] mb-1">Click to upload or drag and drop</p>
                                                    <p className="text-xs text-[#737373]">PDF, Word, or Text files</p>
                                                </>
                                            )}
                                        </div>

                                        {/* OR Divider */}
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
                                            <span className="text-xs text-[#737373] font-medium">OR</span>
                                            <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
                                        </div>

                                        {/* Text Input */}
                                        <div>
                                            <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Enter PRD Content Manually</label>
                                            <Textarea
                                                value={prdText}
                                                onChange={(e) => setPrdText(e.target.value)}
                                                placeholder="Describe your project requirements, features, user stories, technical specifications..."
                                                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[180px] placeholder:text-[#334155] resize-none"
                                            />
                                        </div>

                                        {/* Additional Context */}
                                        <div>
                                            <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Additional Context (Optional)</label>
                                            <Textarea
                                                value={additionalContext}
                                                onChange={(e) => setAdditionalContext(e.target.value)}
                                                placeholder="Budget constraints, team size, timeline, preferred technologies, existing infrastructure..."
                                                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[100px] placeholder:text-[#334155] resize-none"
                                            />
                                        </div>

                                        {/* Timeline */}
                                        <div>
                                            <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                                                <Calendar className="w-4 h-4 inline mr-2" />
                                                Project Timeline (Optional)
                                            </label>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs text-[#737373] block mb-1.5">Start Date</label>
                                                    <Input
                                                        type="date"
                                                        value={startDate}
                                                        onChange={(e) => setStartDate(e.target.value)}
                                                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-[#737373] block mb-1.5">End Date</label>
                                                    <Input
                                                        type="date"
                                                        value={endDate}
                                                        onChange={(e) => setEndDate(e.target.value)}
                                                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                                    />
                                                </div>
                                            </div>
                                            {startDate && endDate && (
                                                <p className="text-xs text-[#737373] mt-2">
                                                    {Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 7))} weeks 
                                                    = ~{Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 14)))} sprints (2-week each)
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                    {uploadMode === 'roadmap' && (
                                        <div className="space-y-6">
                                            <div>
                                                <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Weeks per Sprint</label>
                                                <div className="flex items-center gap-4">
                                                    <input 
                                                        type="range" 
                                                        min="1" 
                                                        max="6" 
                                                        value={sprintWeeks}
                                                        onChange={(e) => setSprintWeeks(parseInt(e.target.value))}
                                                        className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer"
                                                        style={{
                                                            background: `linear-gradient(to right, #E0B954 0%, #E0B954 ${(sprintWeeks / 6) * 100}%, rgba(255,255,255,0.1) ${(sprintWeeks / 6) * 100}%, rgba(255,255,255,0.1) 100%)`
                                                        }}
                                                    />
                                                    <div className="w-16 h-10 bg-[rgba(224,185,84,0.15)] border border-[#E0B954]/30 rounded-lg flex items-center justify-center">
                                                        <span className="text-sm font-semibold text-[#E0B954]">{sprintWeeks} weeks</span>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-[#737373] mt-2">This will help determine how sprints are created from your roadmap</p>
                                            </div>

                                            <div>
                                                <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Upload Roadmap File</label>
                                                <div 
                                                    onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.accept = '.xlsx,.xls';
                                                        input.onchange = (e) => {
                                                            const file = (e.target as HTMLInputElement).files?.[0];
                                                            if (file) handleRoadmapFileUpload({target: {files: [file]}} as any);
                                                        };
                                                        input.click();
                                                    }}
                                                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                                                        roadmapFile 
                                                            ? 'border-[#E0B954] bg-[#E0B954]/5' 
                                                            : 'border-[rgba(255,255,255,0.08)] hover:border-[#E0B954]/50 hover:bg-[rgba(255,255,255,0.02)]'
                                                    }`}
                                                >
                                                    {roadmapFile ? (
                                                        <div className="flex items-center justify-center gap-3">
                                                            <div className="w-12 h-12 rounded-xl bg-[#E0B954]/20 flex items-center justify-center">
                                                                <FileText className="w-6 h-6 text-[#E0B954]" />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-white font-medium">{roadmapFile.name}</p>
                                                                <p className="text-xs text-[#737373]">{(roadmapFile.size / 1024).toFixed(1)} KB</p>
                                                            </div>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setRoadmapFile(null); }}
                                                                className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-red-400"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Upload className="w-10 h-10 text-[#737373] mx-auto mb-3" />
                                                            <p className="text-[#a3a3a3] mb-1">Click to upload or drag and drop</p>
                                                            <p className="text-xs text-[#737373]">Excel files (.xlsx, .xls)</p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-[rgba(102,184,255,0.1)] border border-[rgba(102,184,255,0.3)] rounded-xl p-4">
                                                <p className="text-xs text-[#66b8ff] flex gap-2 items-start">
                                                    <span className="mt-0.5">ℹ️</span>
                                                    <span>Roadmap file should contain tables with columns: Type, Name, Description, Milestone, Epic, Priority, Effort, Assignee, and Weekly hours.</span>
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step: Analyzing */}
                            {aiStep === 'analyzing' && (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center mb-6 animate-pulse">
                                        <Sparkles className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="w-12 h-12 border-3 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin mb-6" />
                                    <h3 className="text-xl font-semibold text-white mb-2">AI is analyzing your project</h3>
                                    <p className="text-[#737373] text-center max-w-md">
                                        Performing cost analysis, recommending tools, and generating architecture options...
                                    </p>
                                </div>
                            )}

                            {/* Step: Architecture Selection / Roadmap Summary */}
                            {aiStep === 'architectures' && (
                                <div className="space-y-6">
                                    {/* PRD Analysis Summary */}
                                    {analysis && (
                                        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
                                            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                                <Target className="w-4 h-4 text-[#E0B954]" />
                                                PRD Analysis Summary
                                            </h3>
                                            <p className="text-sm text-[#a3a3a3] mb-4">{analysis.summary}</p>
                                            
                                            {analysis.key_features && analysis.key_features.length > 0 && (
                                                <div className="mb-4">
                                                    <p className="text-xs text-[#737373] font-medium mb-2">Key Features</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {analysis.key_features.slice(0, 6).map((feature, i) => (
                                                            <span key={i} className="px-2.5 py-1 rounded-lg bg-[#E0B954]/10 text-[#E0B954] text-xs">
                                                                {feature}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {analysis.recommended_tools && (
                                                <div>
                                                    <p className="text-xs text-[#737373] font-medium mb-2">Recommended Tools</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.entries(analysis.recommended_tools).slice(0, 6).map(([category, tool]) => (
                                                            <span key={category} className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs">
                                                                {category}: {String(tool)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Roadmap Summary */}
                                    {roadmapSummary && (
                                        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
                                            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                                <Target className="w-4 h-4 text-[#E0B954]" />
                                                Roadmap Summary
                                            </h3>

                                            {/* Key Stats */}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                                <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Epics</p>
                                                    <p className="text-lg font-bold text-[#66b8ff]">{roadmapSummary.total_epics}</p>
                                                </div>
                                                <div className="bg-[rgba(224,185,84,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Tasks</p>
                                                    <p className="text-lg font-bold text-[#E0B954]">{roadmapSummary.total_tasks}</p>
                                                </div>
                                                <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Team Size</p>
                                                    <p className="text-lg font-bold text-[#10b981]">{roadmapSummary.total_assignees}</p>
                                                </div>
                                                <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Duration</p>
                                                    <p className="text-lg font-bold text-[#F59E0B]">{roadmapSummary.timeline.duration_weeks}w</p>
                                                </div>
                                            </div>

                                            {/* Timeline */}
                                            <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                                                <p className="text-xs font-medium text-[#737373] mb-2">Timeline</p>
                                                <p className="text-sm text-[#a3a3a3]">
                                                    {roadmapSummary.timeline.start} → {roadmapSummary.timeline.end}
                                                </p>
                                            </div>

                                            {/* Team Members */}
                                            {roadmapSummary.assignees && roadmapSummary.assignees.length > 0 && (
                                                <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                                                    <p className="text-xs font-medium text-[#737373] mb-2">Team Members</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {roadmapSummary.assignees.map((assignee: string, i: number) => (
                                                            <span key={i} className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs">
                                                                {assignee}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Warnings */}
                                            {roadmapSummary.warnings && roadmapSummary.warnings.length > 0 && (
                                                <div className="mb-4">
                                                    <p className="text-xs font-medium text-[#f59e0b] mb-2">⚠️ Warnings ({roadmapSummary.warnings.length})</p>
                                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
                                                        {roadmapSummary.warnings.map((warning: any, i: number) => (
                                                            <div key={i} className="text-xs text-[#737373] bg-[rgba(245,158,11,0.08)] p-2 rounded">
                                                                <p className="font-medium text-[#f59e0b]">{warning.issue}</p>
                                                                <p className="text-xs">{warning.task}: {warning.detail}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Conflicts */}
                                            {roadmapSummary.conflicts && roadmapSummary.conflicts.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-medium text-[#ef4444] mb-2">🔴 Conflicts ({roadmapSummary.conflicts.length})</p>
                                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
                                                        {roadmapSummary.conflicts.map((conflict: any, i: number) => (
                                                            <div key={i} className="text-xs text-[#737373] bg-[rgba(239,68,68,0.08)] p-2 rounded">
                                                                <p className="font-medium text-[#ef4444]">{conflict.assignee} - Week {conflict.week}</p>
                                                                <p>{conflict.total_hrs}h scheduled (tasks: {conflict.tasks.join(', ')})</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Architecture Cards (PRD Mode) */}
                                    {!roadmapSummary && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-white mb-4">Select Architecture</h3>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {architectures.map((arch) => (
                                                    <ArchitectureCard
                                                        key={arch.id}
                                                        architecture={arch}
                                                        isSelected={selectedArchitectureId === arch.id}
                                                        onSelect={() => handleSelectArchitecture(arch.id)}
                                                        onViewFullScreen={() => setEditingArchitecture(arch)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step: Preview Tickets */}
                            {aiStep === 'preview' && (
                                <div className="space-y-6">
                                    {/* PRD Mode - Summary Stats */}
                                    {uploadMode === 'prd' && ticketsSummary && (
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                                                <p className="text-2xl font-bold text-[#E0B954]">{generatedTickets.length}</p>
                                                <p className="text-xs text-[#737373]">Tickets</p>
                                            </div>
                                            <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                                                <p className="text-2xl font-bold text-[#F59E0B]">{ticketsSummary.total_story_points}</p>
                                                <p className="text-xs text-[#737373]">Total Points</p>
                                            </div>
                                            <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                                                <p className="text-2xl font-bold text-[#E0B954]">{ticketsSummary.total_estimated_hours}h</p>
                                                <p className="text-xs text-[#737373]">Estimated Hours</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Roadmap Mode - Summary Stats */}
                                    {uploadMode === 'roadmap' && roadmapSummary && (
                                        <>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Epics</p>
                                                    <p className="text-lg font-bold text-[#66b8ff]">{roadmapSummary.total_epics}</p>
                                                </div>
                                                <div className="bg-[rgba(224,185,84,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Tasks</p>
                                                    <p className="text-lg font-bold text-[#E0B954]">{roadmapSummary.total_tasks}</p>
                                                </div>
                                                <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Team Size</p>
                                                    <p className="text-lg font-bold text-[#10b981]">{roadmapSummary.total_assignees}</p>
                                                </div>
                                                <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
                                                    <p className="text-xs text-[#737373] mb-1">Duration</p>
                                                    <p className="text-lg font-bold text-[#F59E0B]">{roadmapSummary.timeline?.duration_weeks || '?'}w</p>
                                                </div>
                                            </div>

                                            {/* Sprint Info */}
                                            {roadmapSummary.total_sprints !== undefined && (
                                                <div className="bg-[rgba(224,185,84,0.1)] border border-[#E0B954]/20 rounded-xl p-4">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
                                                            <BarChart3 className="w-5 h-5 text-[#E0B954]" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-white">Sprint Plan</p>
                                                            <p className="text-xs text-[#737373]">{sprintWeeks} weeks per sprint</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-2xl font-bold text-[#E0B954] mb-1">{roadmapSummary.total_sprints} Sprints</p>
                                                    <p className="text-xs text-[#a3a3a3]">Will be created with {sprintWeeks}-week cycles</p>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Sprint Recommendation (PRD only) */}
                                    {uploadMode === 'prd' && ticketsSummary?.sprint_recommendation && (
                                        <div className="bg-[#E0B954]/10 border border-[#E0B954]/20 rounded-xl p-4">
                                            <p className="text-sm text-[#E0B954] font-medium">Sprint Recommendation</p>
                                            <p className="text-xs text-[#a3a3a3] mt-1">{ticketsSummary.sprint_recommendation}</p>
                                        </div>
                                    )}

                                    {/* Tickets List - PRD Mode */}
                                    {uploadMode === 'prd' && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                                <ClipboardList className="w-4 h-4 text-[#E0B954]" />
                                                Generated Tickets ({generatedTickets.length})
                                            </h3>
                                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                                {generatedTickets.length === 0 ? (
                                                    <div className="text-center py-8 text-[#737373]">
                                                        <p>No tickets generated. Please try again.</p>
                                                    </div>
                                                ) : (
                                                    generatedTickets.map((ticket, index) => {
                                                        const typeInfo = TYPE_CONFIG[ticket.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.task;
                                                        const TypeIcon = typeInfo.icon;
                                                        return (
                                                            <div key={index} className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}>
                                                                                <TypeIcon className="w-3 h-3" />
                                                                                {typeInfo.label}
                                                                            </div>
                                                                            <Badge variant="outline" className={`text-[10px] ${
                                                                                ticket.priority === 'critical' ? 'border-red-500/60 text-red-400' :
                                                                                ticket.priority === 'high' ? 'border-orange-500/60 text-orange-400' :
                                                                                ticket.priority === 'medium' ? 'border-yellow-500/50 text-yellow-400' :
                                                                                'border-emerald-500/50 text-emerald-400'
                                                                            }`}>
                                                                                {ticket.priority}
                                                                            </Badge>
                                                                        </div>
                                                                        <h4 className="text-sm font-medium text-white mb-1">{ticket.title}</h4>
                                                                        <p className="text-xs text-[#737373] line-clamp-2">{ticket.description}</p>
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs text-[#737373]">{ticket.story_points} pts</span>
                                                                            <span className="text-xs text-[#737373]">{ticket.estimated_hours}h</span>
                                                                        </div>
                                                                        {ticket.assignee_name && (
                                                                            <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
                                                                                <Users className="w-3 h-3 text-[#E0B954]" />
                                                                                <span className="text-xs text-[#a3a3a3]">{ticket.assignee_name}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {ticket.assignee_reasoning && (
                                                                    <p className="text-[10px] text-[#737373] mt-2 italic">Assignment: {ticket.assignee_reasoning}</p>
                                                                )}
                                                                {ticket.tags && ticket.tags.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                                        {ticket.tags.map(tag => (
                                                                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] text-[#737373]">{tag}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tickets List - Roadmap Mode */}
                                    {uploadMode === 'roadmap' && roadmapParsedData && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                                <ClipboardList className="w-4 h-4 text-[#E0B954]" />
                                                Roadmap Tickets ({roadmapParsedData.tickets?.length || 0})
                                            </h3>
                                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                                {!roadmapParsedData.tickets || roadmapParsedData.tickets.length === 0 ? (
                                                    <div className="text-center py-8 text-[#737373]">
                                                        <p>No tickets found in roadmap.</p>
                                                    </div>
                                                ) : (
                                                    roadmapParsedData.tickets.map((ticket: any, index: number) => (
                                                        <div key={index} className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <Badge className="text-[10px] bg-[#E0B954]/20 text-[#E0B954] border-0">
                                                                            {ticket.priority || 'medium'}
                                                                        </Badge>
                                                                    </div>
                                                                    <h4 className="text-sm font-medium text-white mb-1">{ticket.name}</h4>
                                                                    <p className="text-xs text-[#737373] line-clamp-2">{ticket.description || 'No description'}</p>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                                                    <span className="text-xs text-[#737373]">{ticket.effort_hrs || 0}h</span>
                                                                    {ticket.assignee && (
                                                                        <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
                                                                            <Users className="w-3 h-3 text-[#E0B954]" />
                                                                            <span className="text-xs text-[#a3a3a3]">{ticket.assignee}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {ticket.milestone && (
                                                                <p className="text-[10px] text-[#737373] mt-2">Milestone: {ticket.milestone}</p>
                                                            )}
                                                            {ticket.epic && (
                                                                <p className="text-[10px] text-[#737373]">Epic: {ticket.epic}</p>
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step: Committing */}
                            {aiStep === 'committing' && (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center mb-6">
                                        <GitCommit className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="w-12 h-12 border-3 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin mb-6" />
                                    <h3 className="text-xl font-semibold text-white mb-2">Creating Tickets</h3>
                                    <p className="text-[#737373] text-center max-w-md">
                                        Adding tickets to your board and assigning to team members...
                                    </p>
                                </div>
                            )}

                            {/* Step: Done */}
                            {aiStep === 'done' && (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-20 h-20 rounded-full bg-[#E0B954]/20 flex items-center justify-center mb-6">
                                        <CheckCircle2 className="w-10 h-10 text-[#E0B954]" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">All Done!</h3>
                                    <p className="text-[#a3a3a3] mb-6">
                                        <span className="text-2xl font-bold text-[#E0B954]">{createdTicketCount}</span> tickets created successfully
                                    </p>
                                    <Button
                                        onClick={() => setShowAIModal(false)}
                                        className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-8"
                                    >
                                        View Board
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        {(aiStep === 'upload' || aiStep === 'architectures' || aiStep === 'preview') && (
                            <div className="flex items-center justify-between p-5 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        if (aiStep === 'architectures') setAiStep('upload');
                                        else if (aiStep === 'preview') setAiStep('architectures');
                                        else setShowAIModal(false);
                                    }}
                                    className="text-[#737373] rounded-xl"
                                >
                                    {aiStep === 'upload' ? 'Cancel' : 'Back'}
                                </Button>

                                {aiStep === 'upload' && (
                                    <>
                                        {uploadMode === 'prd' && (
                                            <Button
                                                onClick={handleAnalyzePRD}
                                                disabled={!prdFile && !prdText.trim()}
                                                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                                            >
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                Analyze PRD
                                            </Button>
                                        )}
                                        {uploadMode === 'roadmap' && (
                                            <Button
                                                onClick={handleParseRoadmap}
                                                disabled={!roadmapFile}
                                                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                                            >
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                Parse Roadmap
                                            </Button>
                                        )}
                                    </>
                                )}

                                {aiStep === 'architectures' && (
                                    <>
                                        {uploadMode === 'prd' ? (
                                            <Button
                                                onClick={handlePreviewTickets}
                                                disabled={!selectedArchitectureId}
                                                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                                            >
                                                <ArrowRight className="w-4 h-4 mr-2" />
                                                Preview Tickets
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={() => setAiStep('preview')}
                                                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
                                            >
                                                <ArrowRight className="w-4 h-4 mr-2" />
                                                Create Tickets from Roadmap
                                            </Button>
                                        )}
                                    </>
                                )}

                                {aiStep === 'preview' && (
                                    <Button
                                        onClick={uploadMode === 'prd' ? handleCommitArchitecture : handleCommitRoadmap}
                                        className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#E0B954]/20"
                                    >
                                        <GitCommit className="w-4 h-4 mr-2" />
                                        {uploadMode === 'prd' ? 'Commit & Create Tickets' : 'Create Tickets from Roadmap'}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Create Sprint Modal */}
            {showCreateSprintModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowCreateSprintModal(false); setNewSprint({ name: '', goal: '', start_date: '', end_date: '' }); }}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
                            <h2 className="text-lg font-bold text-white">Create New Sprint</h2>
                            <button onClick={() => { setShowCreateSprintModal(false); setNewSprint({ name: '', goal: '', start_date: '', end_date: '' }); }} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint Name *</label>
                                <Input
                                    value={newSprint.name}
                                    onChange={(e) => setNewSprint(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g., Sprint 1: Foundation"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint Goal</label>
                                <Textarea
                                    value={newSprint.goal}
                                    onChange={(e) => setNewSprint(f => ({ ...f, goal: e.target.value }))}
                                    placeholder="What do we want to achieve in this sprint?"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-[#737373] block mb-1.5">Start Date *</label>
                                    <Popover open={showCalendarSprintStart} onOpenChange={setShowCalendarSprintStart}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${
                                                    !newSprint.start_date ? 'text-[#737373]' : ''
                                                }`}
                                            >
                                                <Calendar className="mr-2 h-4 w-4" />
                                                {newSprint.start_date ? parseLocalDate(newSprint.start_date)?.toLocaleDateString() : 'Pick a date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent side="bottom" align="start" className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]">
                                            <CalendarIcon
                                                mode="single"
                                                selected={parseLocalDate(newSprint.start_date)}
                                                onSelect={(date) => {
                                                    if (date) {
                                                        const year = date.getFullYear();
                                                        const month = String(date.getMonth() + 1).padStart(2, '0');
                                                        const day = String(date.getDate()).padStart(2, '0');
                                                        const localDate = `${year}-${month}-${day}`;
                                                        setNewSprint(f => ({ ...f, start_date: localDate }));
                                                        setShowCalendarSprintStart(false);
                                                    }
                                                }}
                                                classNames={{
                                                    months: "flex flex-col",
                                                    month: "space-y-4",
                                                    caption: "flex justify-between items-center px-0 pb-4 relative h-7 mb-2",
                                                    caption_label: "text-sm font-medium text-white",
                                                    nav: "space-x-1 flex items-center",
                                                    nav_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1",
                                                    nav_button_previous: "absolute left-0",
                                                    nav_button_next: "absolute right-0",
                                                    table: "w-full border-collapse space-y-1",
                                                    head_row: "flex",
                                                    head_cell: "text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded",
                                                    row: "flex w-full gap-1",
                                                    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent",
                                                    day: "h-8 w-8 p-0 font-normal",
                                                    day_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors",
                                                    day_selected: "bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold",
                                                    day_today: "bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold",
                                                    day_outside: "text-[#444]",
                                                    day_disabled: "text-[#333] opacity-50 cursor-not-allowed",
                                                    day_range_middle: "aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white",
                                                    day_hidden: "invisible",
                                                }}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[#737373] block mb-1.5">End Date *</label>
                                    <Popover open={showCalendarSprintEnd && !!newSprint.start_date} onOpenChange={(open) => newSprint.start_date && setShowCalendarSprintEnd(open)}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                disabled={!newSprint.start_date}
                                                className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${
                                                    !newSprint.end_date ? 'text-[#737373]' : ''
                                                } ${!newSprint.start_date ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                title={!newSprint.start_date ? 'Set start date first' : ''}
                                            >
                                                <Calendar className="mr-2 h-4 w-4" />
                                                {newSprint.end_date ? parseLocalDate(newSprint.end_date)?.toLocaleDateString() : 'Pick a date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent side="bottom" align="start" className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]">
                                            <div className="mb-3 pb-3 border-b border-[rgba(255,255,255,0.05)]">
                                                <p className="text-[10px] text-[#737373] font-medium uppercase mb-1.5">Sprint Duration</p>
                                                <div className="space-y-1">
                                                    <p className="text-xs text-[#737373]">Start: <span className="text-[#E0B954] font-medium">{parseLocalDate(newSprint.start_date)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>
                                                    <p className="text-xs text-[#737373]">End: <span className="text-white font-medium">Pick a date</span></p>
                                                </div>
                                            </div>
                                            <CalendarIcon
                                                mode="single"
                                                month={parseLocalDate(newSprint.start_date) || new Date()}
                                                selected={parseLocalDate(newSprint.end_date)}
                                                onSelect={(date) => {
                                                    if (date) {
                                                        const year = date.getFullYear();
                                                        const month = String(date.getMonth() + 1).padStart(2, '0');
                                                        const day = String(date.getDate()).padStart(2, '0');
                                                        const localDate = `${year}-${month}-${day}`;
                                                        setNewSprint(f => ({ ...f, end_date: localDate }));
                                                        setShowCalendarSprintEnd(false);
                                                    }
                                                }}
                                                disabled={(date) => newSprint.start_date ? date < parseLocalDate(newSprint.start_date)! : false}
                                                classNames={{
                                                    months: "flex flex-col",
                                                    month: "space-y-4",
                                                    caption: "flex justify-between items-center px-0 pb-4 relative h-7 mb-2",
                                                    caption_label: "text-sm font-medium text-white",
                                                    nav: "space-x-1 flex items-center",
                                                    nav_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1",
                                                    nav_button_previous: "absolute left-0",
                                                    nav_button_next: "absolute right-0",
                                                    table: "w-full border-collapse space-y-1",
                                                    head_row: "flex",
                                                    head_cell: "text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded",
                                                    row: "flex w-full gap-1",
                                                    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent",
                                                    day: "h-8 w-8 p-0 font-normal",
                                                    day_button: "text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors",
                                                    day_selected: "bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold",
                                                    day_today: "bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold",
                                                    day_outside: "text-[#444]",
                                                    day_disabled: "text-[#333] opacity-50 cursor-not-allowed",
                                                    day_range_middle: "aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white",
                                                    day_hidden: "invisible",
                                                }}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
                            <Button variant="ghost" onClick={() => { setShowCreateSprintModal(false); setNewSprint({ name: '', goal: '', start_date: '', end_date: '' }); }} className="text-[#737373] rounded-xl px-5">Cancel</Button>
                            <Button
                                onClick={handleCreateSprint}
                                disabled={!newSprint.name.trim() || !newSprint.start_date || !newSprint.end_date}
                                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                                title={!newSprint.start_date || !newSprint.end_date ? 'Start and End dates are required' : ''}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Create Sprint
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reviewer Panel - slide in from right */}
            {showReviewer && (
                <div className="fixed inset-y-0 right-0 w-[480px] max-w-full bg-[#080808] border-l border-[rgba(255,255,255,0.07)] shadow-2xl z-50 flex flex-col">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#E0B954]/10 flex items-center justify-center">
                                <Eye className="w-4 h-4 text-[#E0B954]" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-white">Review Queue</h2>
                                <p className="text-xs text-[#737373]">Items pending review</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowReviewer(false)}
                            className="p-1.5 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <ReviewerView
                            workItems={workItems.map(item => ({
                                ...item, 
                                assignee_id: item.assignee_id ?? undefined,
                                sprint_id: item.sprint_id ?? undefined,
                                parent_id: item.parent_id ?? undefined,
                                epic_id: item.epic_id ?? undefined,
                                due_date: item.due_date ?? undefined,
                                estimated_hours: item.estimated_hours ?? undefined
                            }))}
                            projectId={id!}
                            token={token!}
                            onTaskUpdate={(itemId, updates) => {
                                setWorkItems(prev => prev.map(item =>
                                    item.id === itemId ? { ...item, ...updates } : item
                                ));
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Architecture Editor Modal */}
            {editingArchitecture && (
                <ArchitectureEditor
                    architecture={editingArchitecture}
                    onSave={handleSaveArchitecture}
                    onClose={() => setEditingArchitecture(null)}
                />
            )}
        </div>
    );
};

export default ProjectBoard;
