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

// Debug endpoint for testing
router.get('/debug/user', async (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.json({ 
            error: 'No token provided',
            usage: 'Add ?token=YOUR_TOKEN to test user endpoint'
        });
    }
    
    try {
        // Test direct user endpoint
        const userResponse = await fetch('https://api.clickup.com/api/v2/user', {
            headers: { 
                'Authorization': token,
                'accept': 'application/json'
            }
        });
        
        const userData = await userResponse.json();
        
        res.json({
            status: userResponse.status,
            ok: userResponse.ok,
            data: userData,
            message: userResponse.ok ? 'Success' : 'Failed'
        });
    } catch (error) {
        res.json({
            error: error.message,
            message: 'Request failed'
        });
    }
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
        
        let userData = null;
        let userInfo = null;
        
        // Try method 1: team users endpoint
        try {
            console.log('[BE] Trying team users endpoint...');
            const userResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/user?include_shared=false`, {
                headers: { 
                    'Authorization': token,
                    'accept': 'application/json'
                }
            });
            
            if (userResponse.ok) {
                userData = await userResponse.json();
                console.log('[BE] Team users response:', JSON.stringify(userData, null, 2));
            } else {
                console.log('[BE] Team users endpoint failed:', userResponse.status);
            }
        } catch (error) {
            console.log('[BE] Team users endpoint error:', error.message);
        }
        
        // Try method 2: direct user endpoint if first failed
        if (!userData) {
            try {
                console.log('[BE] Trying direct user endpoint...');
                const directUserResponse = await fetch('https://api.clickup.com/api/v2/user', {
                    headers: { 
                        'Authorization': token,
                        'accept': 'application/json'
                    }
                });
                
                if (directUserResponse.ok) {
                    userData = await directUserResponse.json();
                    console.log('[BE] Direct user response:', JSON.stringify(userData, null, 2));
                } else {
                    console.log('[BE] Direct user endpoint failed:', directUserResponse.status);
                }
            } catch (error) {
                console.log('[BE] Direct user endpoint error:', error.message);
            }
        }
        
        if (!userData) {
            throw new Error('Both user endpoints failed');
        }
        
        // Extract user information from the response
        console.log('[BE] Available keys in userData:', Object.keys(userData));
        
        let extractedUser = null;
        
        // Try different possible response structures
        if (userData.members && userData.members.length > 0) {
            extractedUser = userData.members[0].user || userData.members[0];
            console.log('[BE] Found user in members:', extractedUser);
        } else if (userData.users && userData.users.length > 0) {
            extractedUser = userData.users[0].user || userData.users[0];
            console.log('[BE] Found user in users:', extractedUser);
        } else if (userData.user) {
            extractedUser = userData.user;
            console.log('[BE] Found user directly:', extractedUser);
        } else if (userData.member && userData.member.user) {
            extractedUser = userData.member.user;
            console.log('[BE] Found user in member:', extractedUser);
        }
        
        if (!extractedUser) {
            console.error('[BE] No user found in any expected location. Full response:', JSON.stringify(userData, null, 2));
            throw new Error('No user data found in response');
        }
        
        // Return clean user data
        const responseData = {
            user: {
                id: extractedUser.id,
                username: extractedUser.username || 'ClickUp User',
                email: extractedUser.email || 'user@clickup.com',
                profilePicture: extractedUser.profilePicture,
                color: extractedUser.color,
                initials: extractedUser.initials,
                role: extractedUser.role || 3,
                lastActive: extractedUser.last_active,
                dateJoined: extractedUser.date_joined,
                dateInvited: extractedUser.date_invited
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
                            const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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
                        const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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
                    const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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
                const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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
                    const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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
                const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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

// Create new tag
router.post('/tag', express.json(), async (req, res) => {
    const { name, color } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    
    if (!token) {
        return res.status(401).json({ error: 'Access token is required' });
    }
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Tag name is required' });
    }
    
    try {
        console.log(`[BE] Creating tag: ${name} with color: ${color}`);
        
        // First get user's workspaces to find the space
        const workspacesResponse = await fetch('https://api.clickup.com/api/v2/team', {
            headers: { 'Authorization': token }
        });
        
        if (!workspacesResponse.ok) {
            const errorData = await workspacesResponse.json();
            return res.status(workspacesResponse.status).json({ 
                error: 'Failed to get workspaces',
                details: errorData
            });
        }
        
        const workspacesData = await workspacesResponse.json();
        const teams = workspacesData.teams || [];
        
        if (teams.length === 0) {
            return res.status(404).json({ error: 'No workspaces found' });
        }
        
        // Get spaces from the first team
        const teamId = teams[0].id;
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
            headers: { 'Authorization': token }
        });
        
        if (!spacesResponse.ok) {
            const errorData = await spacesResponse.json();
            return res.status(spacesResponse.status).json({ 
                error: 'Failed to get spaces',
                details: errorData
            });
        }
        
        const spacesData = await spacesResponse.json();
        const spaces = spacesData.spaces || [];
        
        if (spaces.length === 0) {
            return res.status(404).json({ error: 'No spaces found' });
        }
        
        // Use the first space to create the tag
        const spaceId = spaces[0].id;
        
        // Create tag in the space
        const createTagResponse = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/tag`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name.trim(),
                tag_fg: color || '#ffffff',
                tag_bg: color || '#4f8cff'
            })
        });
        
        if (!createTagResponse.ok) {
            const errorData = await createTagResponse.json();
            return res.status(createTagResponse.status).json({ 
                error: 'Failed to create tag in ClickUp',
                details: errorData
            });
        }
        
        const newTag = await createTagResponse.json();
        console.log(`[BE] Tag created successfully: ${name}`);
        
        res.json({
            success: true,
            message: `Tag created successfully: ${name}`,
            tag: newTag
        });
        
    } catch (err) {
        console.error('[BE] Error creating tag:', err);
        res.status(500).json({ 
            error: 'Internal server error',
            details: err.message
        });
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
                    const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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
                const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true`, {
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
