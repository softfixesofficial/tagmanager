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
        console.log('[BE] Fetching user data with token:', token.substring(0, 20) + '...');
        
        // First get teams to get team ID
        const teamsResponse = await fetch('https://api.clickup.com/api/v2/team', {
            headers: { 
                'Authorization': token,
                'accept': 'application/json'
            }
        });
        
        if (!teamsResponse.ok) {
            const errorText = await teamsResponse.text();
            console.error('[BE] Teams API error:', teamsResponse.status, errorText);
            throw new Error(`Teams API failed: ${teamsResponse.status} - ${errorText}`);
        }
        
        const teamsData = await teamsResponse.json();
        console.log('[BE] Teams data:', JSON.stringify(teamsData, null, 2));
        
        if (!teamsData.teams || teamsData.teams.length === 0) {
            throw new Error('No teams found for user');
        }
        
        const teamId = teamsData.teams[0].id;
        console.log('[BE] Using team ID:', teamId);
        
        // Now get user data with team ID
        const userResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/user?include_shared=false`, {
            headers: { 
                'Authorization': token,
                'accept': 'application/json'
            }
        });
        
        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('[BE] User API error:', userResponse.status, errorText);
            throw new Error(`User API failed: ${userResponse.status} - ${errorText}`);
        }
        
        const userData = await userResponse.json();
        console.log('[BE] Raw ClickUp user data:', JSON.stringify(userData, null, 2));
        
        // Extract user information from the response
        const users = userData.members || userData.users || [];
        if (users.length === 0) {
            throw new Error('No user data found in response');
        }
        
        const user = users[0].user || users[0];
        
        // Return clean user data
        const responseData = {
            user: {
                id: user.id,
                username: user.username || 'ClickUp User',
                email: user.email || 'user@clickup.com',
                profilePicture: user.profilePicture,
                color: user.color,
                initials: user.initials,
                role: user.role || 3,
                lastActive: user.last_active,
                dateJoined: user.date_joined,
                dateInvited: user.date_invited
            }
        };
        
        console.log('[BE] Returning clean user data:', JSON.stringify(responseData, null, 2));
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
