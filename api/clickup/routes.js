require('dotenv').config();
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { ClickUpTag, ClickUpTask, ClickUpUser } = require('../../landing/models/clickup');

const router = express.Router();

// OAuth config
const CLICKUP_CLIENT_ID = process.env.CLICKUP_CLIENT_ID;
const CLICKUP_CLIENT_SECRET = process.env.CLICKUP_CLIENT_SECRET;
const CLICKUP_REDIRECT_URI = process.env.CLICKUP_REDIRECT_URI;

// Get OAuth URL
router.get('/login', (req, res) => {
    const url = `https://app.clickup.com/api?client_id=${encodeURIComponent(CLICKUP_CLIENT_ID)}&redirect_uri=${encodeURIComponent(CLICKUP_REDIRECT_URI)}`;
    res.json({ url });
});

// Get user information
router.get('/user', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'No token provided' });
    
    try {
        // Get user data
        const userResponse = await fetch('https://api.clickup.com/api/v2/user', {
            headers: { 'Authorization': token }
        });
        
        if (!userResponse.ok) {
            throw new Error(`User API failed: ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        console.log('[BE] User data received:', userData);
        
        // Get team/workspace data
        let teamData = null;
        try {
            const teamResponse = await fetch('https://api.clickup.com/api/v2/team', {
                headers: { 'Authorization': token }
            });
            
            if (teamResponse.ok) {
                const teamsData = await teamResponse.json();
                if (teamsData.teams && teamsData.teams.length > 0) {
                    teamData = teamsData.teams[0];
                }
            }
        } catch (teamErr) {
            console.warn('[BE] Team data fetch failed:', teamErr.message);
        }
        
        // Return comprehensive user data
        const responseData = {
            user: {
                id: userData.user?.id,
                username: userData.user?.username || userData.user?.name || 'ClickUp User',
                email: userData.user?.email || 'user@clickup.com',
                profilePicture: userData.user?.profilePicture,
                color: userData.user?.color,
                role: 'Member'
            },
            team: teamData ? {
                id: teamData.id,
                name: teamData.name || 'My Workspace',
                color: teamData.color,
                avatar: teamData.avatar,
                plan: 'Free' // Plan info might not be available
            } : {
                name: 'My Workspace',
                plan: 'Free'
            }
        };
        
        console.log('[BE] Returning user data:', responseData);
        res.json(responseData);
        
    } catch (err) {
        console.error('[BE] /api/clickup/user error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all tasks
router.get('/tasks', async (req, res) => {
    let token = req.query.token;
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }
    const listId = req.query.listId;
    if (!token) return res.status(400).json({ error: 'No token provided' });
    
    try {
        let allTasks = [];
        
        if (listId === 'all') {
            const teamsResponse = await fetch('https://api.clickup.com/api/v2/team', {
                headers: { 'Authorization': token }
            });
            const teamsData = await teamsResponse.json();
            const teamId = teamsData.teams[0]?.id;
            
            if (teamId) {
                const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
                    headers: { 'Authorization': token }
                });
                const spacesData = await spacesResponse.json();
                
                for (const space of spacesData.spaces || []) {
                    const foldersResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder`, {
                        headers: { 'Authorization': token }
                    });
                    const foldersData = await foldersResponse.json();
                    
                    for (const folder of foldersData.folders || []) {
                        const listsResponse = await fetch(`https://api.clickup.com/api/v2/folder/${folder.id}/list`, {
                            headers: { 'Authorization': token }
                        });
                        const listsData = await listsResponse.json();
                        
                        for (const list of listsData.lists || []) {
                            const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                                headers: { 'Authorization': token }
                            });
                            const tasksData = await tasksResponse.json();
                            allTasks = allTasks.concat(tasksData.tasks || []);
                        }
                    }
                    
                    const spaceListsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list`, {
                        headers: { 'Authorization': token }
                    });
                    const spaceListsData = await spaceListsResponse.json();
                    
                    for (const list of spaceListsData.lists || []) {
                        const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                            headers: { 'Authorization': token }
                        });
                        const tasksData = await tasksResponse.json();
                        allTasks = allTasks.concat(tasksData.tasks || []);
                    }
                }
            }
        }
        
        const tasks = allTasks.map(task => new ClickUpTask(task));
        res.json({ tasks });
    } catch (err) {
        console.error('[BE] /api/clickup/tasks error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all tags
router.get('/tags', async (req, res) => {
    let token = req.query.token;
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }
    const teamId = req.query.teamId;
    
    if (!token) return res.status(400).json({ error: 'No token provided' });
    
    try {
        const teamsResponse = await fetch('https://api.clickup.com/api/v2/team', {
            headers: { 'Authorization': token }
        });
        const teamsData = await teamsResponse.json();
        
        if (!teamsData.teams || teamsData.teams.length === 0) {
            return res.json({ tags: [] });
        }
        
        const targetTeamId = teamId || teamsData.teams[0].id;
        
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${targetTeamId}/space`, {
            headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let allTags = [];
        
        for (const space of spacesData.spaces || []) {
            const foldersResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder`, {
                headers: { 'Authorization': token }
            });
            const foldersData = await foldersResponse.json();
            
            for (const folder of foldersData.folders || []) {
                const listsResponse = await fetch(`https://api.clickup.com/api/v2/folder/${folder.id}/list`, {
                    headers: { 'Authorization': token }
                });
                const listsData = await listsResponse.json();
                
                for (const list of listsData.lists || []) {
                    const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                        headers: { 'Authorization': token }
                    });
                    const tasksData = await tasksResponse.json();
                    
                    for (const task of tasksData.tasks || []) {
                        if (task.tags && task.tags.length > 0) {
                            for (const tag of task.tags) {
                                const tagId = tag.name;
                                const existingTag = allTags.find(t => t.id === tagId);
                                if (!existingTag) {
                                    const tagData = {
                                        ...tag,
                                        id: tagId,
                                        list_id: list.id,
                                        space_id: space.id,
                                        folder_id: folder.id,
                                        creator_id: task.creator?.id || null,
                                        creator_name: task.creator?.username || null,
                                        created_date: task.date_created,
                                        task_count: 1,
                                        workspace_id: task.workspace_id || null,
                                        chain_id: task.chain_id || null,
                                        userid: task.userid || null,
                                        dependencies: task.dependencies || [],
                                        assignees: task.assignees || [],
                                        priority: task.priority || 'Normal',
                                        due_date: task.due_date || null,
                                        description: task.description || ''
                                    };
                                    allTags.push(new ClickUpTag(tagData));
                                } else {
                                    existingTag.task_count++;
                                }
                            }
                        }
                    }
                }
            }
            
            const spaceListsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list`, {
                headers: { 'Authorization': token }
            });
            const spaceListsData = await spaceListsResponse.json();
            
            for (const list of spaceListsData.lists || []) {
                const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                    headers: { 'Authorization': token }
                });
                const tasksData = await tasksResponse.json();
                
                for (const task of tasksData.tasks || []) {
                    if (task.tags && task.tags.length > 0) {
                        for (const tag of task.tags) {
                            const tagId = tag.name;
                            const existingTag = allTags.find(t => t.id === tagId);
                            if (!existingTag) {
                                const tagData = {
                                    ...tag,
                                    id: tagId,
                                    list_id: list.id,
                                    space_id: space.id,
                                    folder_id: null,
                                    creator_id: task.creator?.id || null,
                                    creator_name: task.creator?.username || null,
                                    created_date: task.date_created,
                                    task_count: 1,
                                    workspace_id: task.workspace_id || null,
                                    chain_id: task.chain_id || null,
                                    userid: task.userid || null,
                                    dependencies: task.dependencies || [],
                                    assignees: task.assignees || [],
                                    priority: task.priority || 'Normal',
                                    due_date: task.due_date || null,
                                    description: task.description || ''
                                };
                                allTags.push(new ClickUpTag(tagData));
                            } else {
                                existingTag.task_count++;
                            }
                        }
                    }
                }
            }
        }
        
        res.json({ tags: allTags });
    } catch (err) {
        console.error('[BE] Error fetching tags:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update tag name
router.put('/tag/:tagId', express.json(), async (req, res) => {
    const { tagId } = req.params;
    const { name } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Tag name is required' });
    }
    
    try {
        const teamResponse = await fetch('https://api.clickup.com/api/v2/team', {
            headers: { 'Authorization': token }
        });
        const teamData = await teamResponse.json();
        const teamId = teamData.teams[0]?.id;
        
        if (!teamId) {
            return res.status(404).json({ error: 'No team found' });
        }
        
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
            headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let updatedTasks = 0;
        
        for (const space of spacesData.spaces || []) {
            const foldersResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder`, {
                headers: { 'Authorization': token }
            });
            const foldersData = await foldersResponse.json();
            
            for (const folder of foldersData.folders || []) {
                const listsResponse = await fetch(`https://api.clickup.com/api/v2/folder/${folder.id}/list`, {
                    headers: { 'Authorization': token }
                });
                const listsData = await listsResponse.json();
                
                for (const list of listsData.lists || []) {
                    const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                        headers: { 'Authorization': token }
                    });
                    const tasksData = await tasksResponse.json();
                    
                    for (const task of tasksData.tasks || []) {
                        if (task.tags && task.tags.some(t => t.name === tagId)) {
                            const updatedTags = task.tags.map(tag => 
                                tag.name === tagId 
                                    ? { ...tag, name: name.trim() }
                                    : tag
                            );
                            
                            const updateResponse = await fetch(`https://api.clickup.com/api/v2/task/${task.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Authorization': token,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ tags: updatedTags })
                            });
                            
                            if (updateResponse.ok) {
                                updatedTasks++;
                            }
                        }
                    }
                }
            }
            
            const spaceListsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list`, {
                headers: { 'Authorization': token }
            });
            const spaceListsData = await spaceListsResponse.json();
            
            for (const list of spaceListsData.lists || []) {
                const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                    headers: { 'Authorization': token }
                });
                const tasksData = await tasksResponse.json();
                
                for (const task of tasksData.tasks || []) {
                    if (task.tags && task.tags.some(t => t.name === tagId)) {
                        const updatedTags = task.tags.map(tag => 
                            tag.name === tagId 
                                ? { ...tag, name: name.trim() }
                                : tag
                        );
                        
                        const updateResponse = await fetch(`https://api.clickup.com/api/v2/task/${task.id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': token,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ tags: updatedTags })
                        });
                        
                        if (updateResponse.ok) {
                            updatedTasks++;
                        }
                    }
                }
            }
        }
        
        res.json({ 
            success: true, 
            message: `Tag name updated in ClickUp: ${tagId} -> ${name}`,
            updatedTasks 
        });
    } catch (err) {
        console.error('[BE] Error updating tag:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete tag
router.delete('/tag/:tagId', async (req, res) => {
    const { tagId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const teamResponse = await fetch('https://api.clickup.com/api/v2/team', {
            headers: { 'Authorization': token }
        });
        const teamData = await teamResponse.json();
        const teamId = teamData.teams[0]?.id;
        
        if (!teamId) {
            return res.status(404).json({ error: 'No team found' });
        }
        
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
            headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let updatedTasks = 0;
        
        for (const space of spacesData.spaces || []) {
            const foldersResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder`, {
                headers: { 'Authorization': token }
            });
            const foldersData = await foldersResponse.json();
            
            for (const folder of foldersData.folders || []) {
                const listsResponse = await fetch(`https://api.clickup.com/api/v2/folder/${folder.id}/list`, {
                    headers: { 'Authorization': token }
                });
                const listsData = await listsResponse.json();
                
                for (const list of listsData.lists || []) {
                    const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                        headers: { 'Authorization': token }
                    });
                    const tasksData = await tasksResponse.json();
                    
                    for (const task of tasksData.tasks || []) {
                        if (task.tags && task.tags.some(t => t.name === tagId)) {
                            const updatedTags = task.tags.filter(tag => tag.name !== tagId);
                            
                            const updateResponse = await fetch(`https://api.clickup.com/api/v2/task/${task.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Authorization': token,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ tags: updatedTags })
                            });
                            
                            if (updateResponse.ok) {
                                updatedTasks++;
                            }
                        }
                    }
                }
            }
            
            const spaceListsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list`, {
                headers: { 'Authorization': token }
            });
            const spaceListsData = await spaceListsResponse.json();
            
            for (const list of spaceListsData.lists || []) {
                const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
                    headers: { 'Authorization': token }
                });
                const tasksData = await tasksResponse.json();
                
                for (const task of tasksData.tasks || []) {
                    if (task.tags && task.tags.some(t => t.name === tagId)) {
                        const updatedTags = task.tags.filter(tag => tag.name !== tagId);
                        
                        const updateResponse = await fetch(`https://api.clickup.com/api/v2/task/${task.id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': token,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ tags: updatedTags })
                        });
                        
                        if (updateResponse.ok) {
                            updatedTasks++;
                        }
                    }
                }
            }
        }
        
        res.json({ 
            success: true, 
            message: `Tag deleted from ClickUp: ${tagId}`,
            updatedTasks 
        });
    } catch (err) {
        console.error('[BE] Error deleting tag:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
