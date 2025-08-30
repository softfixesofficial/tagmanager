// Cloudflare Workers API
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log(`[Worker] Request: ${request.method} ${path}`);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Local ve production için
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // OAuth login endpoint
    if (path === '/login/clickup' && request.method === 'GET') {
      console.log('[Worker] OAuth login requested');
      
      const oauthUrl = `https://app.clickup.com/api?client_id=${encodeURIComponent(env.CLICKUP_CLIENT_ID)}&redirect_uri=${encodeURIComponent(env.CLICKUP_REDIRECT_URI)}`;
      
      console.log('[Worker] OAuth URL:', oauthUrl);
      
      return new Response(JSON.stringify({ url: oauthUrl }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Token exchange endpoint
    if (path === '/api/clickup/token' && request.method === 'POST') {
      console.log('[Worker] Token exchange requested');
      
      const { code } = await request.json();
      
      if (!code) {
        return new Response(JSON.stringify({ error: 'No authorization code provided' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        console.log('[Worker] Exchanging code for token...');
        
        const response = await fetch('https://api.clickup.com/api/v2/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id: env.CLICKUP_CLIENT_ID,
            client_secret: env.CLICKUP_CLIENT_SECRET,
            code: code
          })
        });

        const data = await response.json();
        console.log('[Worker] Token exchange response:', data);
        
        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        console.error('[Worker] Token exchange error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Get tags endpoint
    if (path === '/api/clickup/tags' && request.method === 'GET') {
      console.log('[Worker] Tags requested');
      
      const token = request.headers.get('Authorization')?.replace('Bearer ', '') || url.searchParams.get('token');
      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        console.log('[Worker] Fetching tags from ClickUp...');
        
        // Get teams first
        const teamsResponse = await fetch('https://api.clickup.com/api/v2/team', {
          headers: { 'Authorization': token }
        });
        const teamsData = await teamsResponse.json();
        const teamId = teamsData.teams[0]?.id;
        
        if (!teamId) {
          return new Response(JSON.stringify({ error: 'No team found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // Get spaces for the team (routes.js'deki aynı mantık)
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
          headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let allTags = [];
        
        // First, get all space tags to have the latest color information
        let spaceTagsMap = new Map();
        for (const space of spacesData.spaces || []) {
          try {
            const spaceTagsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/tag`, {
              headers: { 'Authorization': token }
            });
            if (spaceTagsResponse.ok) {
              const spaceTagsData = await spaceTagsResponse.json();
              for (const spaceTag of spaceTagsData.tags || []) {
                spaceTagsMap.set(spaceTag.name, {
                  ...spaceTag,
                  space_id: space.id
                });
              }
            }
          } catch (error) {
            console.error(`[Worker] Error fetching space tags for space ${space.id}:`, error);
          }
        }
        
        console.log(`[Worker] Found ${spaceTagsMap.size} space tags with latest colors`);
        
        // Extract tags from tasks - routes.js'deki tam implementasyon
        for (const space of spacesData.spaces || []) {
          // Get folders in space
          const foldersResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder`, {
            headers: { 'Authorization': token }
          });
          const foldersData = await foldersResponse.json();
          
          // Process folders
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
                    
                    // Get latest color info from space tags
                    const spaceTagInfo = spaceTagsMap.get(tagId);
                    const latestTagInfo = spaceTagInfo || tag;
                    
                    if (!existingTag) {
                      const tagData = {
                        ...latestTagInfo, // Use latest color info
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
                      allTags.push(tagData);
                    } else {
                      existingTag.task_count++;
                      // Update color info if we have newer data
                      if (spaceTagInfo) {
                        existingTag.tag_fg = spaceTagInfo.tag_fg;
                        existingTag.tag_bg = spaceTagInfo.tag_bg;
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Get space lists (folders dışında)
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
                  
                  // Get latest color info from space tags
                  const spaceTagInfo = spaceTagsMap.get(tagId);
                  const latestTagInfo = spaceTagInfo || tag;
                  
                  if (!existingTag) {
                    const tagData = {
                      ...latestTagInfo, // Use latest color info
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
                    allTags.push(tagData);
                  } else {
                    existingTag.task_count++;
                    // Update color info if we have newer data
                    if (spaceTagInfo) {
                      existingTag.tag_fg = spaceTagInfo.tag_fg;
                      existingTag.tag_bg = spaceTagInfo.tag_bg;
                    }
                  }
                }
              }
            }
          }
        }
        
        console.log('[Worker] Tags found:', allTags.length);
        
        return new Response(JSON.stringify({ tags: allTags }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        console.error('[Worker] Tags fetch error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Get tasks endpoint
    if (path === '/api/clickup/tasks' && request.method === 'GET') {
      console.log('[Worker] Tasks requested');
      
      const token = url.searchParams.get('token');
      const listId = url.searchParams.get('listId');
      
      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

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
        
        console.log('[Worker] Tasks found:', allTasks.length);
        
        return new Response(JSON.stringify({ tasks: allTasks }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        console.error('[Worker] Tasks fetch error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Get user endpoint
    if (path === '/api/clickup/user' && request.method === 'GET') {
      console.log('[Worker] User info requested');
      
      const token = url.searchParams.get('token');
      
      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        const response = await fetch('https://api.clickup.com/api/v2/user', {
          headers: { 'Authorization': token }
        });
        const data = await response.json();
        
        console.log('[Worker] User data:', data);
        
        return new Response(JSON.stringify(data.user), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        console.error('[Worker] User fetch error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Update tag color endpoint (must come before general tag update)
    if (path.startsWith('/api/clickup/tag/') && path.includes('/color') && request.method === 'PUT') {
      console.log('[Worker] Tag color update requested');
      const tagId = path.split('/tag/')[1].split('/color')[0];
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return new Response(JSON.stringify({ error: 'No authorization token provided' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        const body = await request.json();
        const { color } = body;
        
        if (!color) {
          return new Response(JSON.stringify({ error: 'Color is required' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // Get team ID first
        const teamResponse = await fetch('https://api.clickup.com/api/v2/team', {
          headers: { 'Authorization': token }
        });
        const teamData = await teamResponse.json();
        const teamId = teamData.teams[0].id;

        // Get all spaces
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
          headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();

        let processedSpaces = 0;
        let errors = [];

        // Update tag color in each space
        for (const space of spacesData.spaces || []) {
          console.log(`[Worker] Updating tag "${tagId}" color to "${color}" in space ${space.id}`);
          
          // Update tag color using Space Tag API
          const updateResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/tag/${encodeURIComponent(tagId)}`, {
            method: 'PUT',
            headers: {
              'Authorization': token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              tag: {
                name: tagId,
                tag_fg: color,
                tag_bg: color
              }
            })
          });
          
          if (updateResponse.ok) {
            processedSpaces++;
            console.log(`[Worker] Successfully updated tag color in space ${space.id}`);
          } else {
            const updateError = await updateResponse.text();
            console.error(`[Worker] Failed to update tag color in space ${space.id}:`, updateError);
            errors.push(`Update in ${space.name}: ${updateError}`);
          }
        }

        if (processedSpaces > 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: `Tag color updated successfully! Processed ${processedSpaces} spaces.`,
            processedSpaces,
            newColor: color,
            errors: errors.length > 0 ? errors : undefined
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Failed to update tag color in any space.`,
            errors
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      } catch (err) {
        console.error('[Worker] Tag color update error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Update tag endpoint - Using Delete + Create workaround
    if (path.startsWith('/api/clickup/tag/') && request.method === 'PUT') {
      console.log('[Worker] Tag update requested - using Delete + Create workaround');
      
      const tagId = path.split('/').pop();
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const body = await request.json();
      const { name } = body;
      
      if (!name || !name.trim()) {
        return new Response(JSON.stringify({ error: 'Tag name is required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        // Get team and spaces
        const teamResponse = await fetch('https://api.clickup.com/api/v2/team', {
          headers: { 'Authorization': token }
        });
        const teamData = await teamResponse.json();
        const teamId = teamData.teams[0]?.id;
        
        if (!teamId) {
          return new Response(JSON.stringify({ error: 'No team found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
          headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let processedSpaces = 0;
        let errors = [];
        let oldTagColor = '#4f8cff';
        
        // Step 1: Find old tag color from space tags
        for (const space of spacesData.spaces || []) {
          const spaceTagsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/tag`, {
            headers: { 'Authorization': token }
          });
          
          if (spaceTagsResponse.ok) {
            const spaceTagsData = await spaceTagsResponse.json();
            const oldTag = spaceTagsData.tags?.find(tag => tag.name === tagId);
            if (oldTag && oldTag.tag_bg) {
              oldTagColor = oldTag.tag_bg;
              console.log(`[Worker] Found old tag color: ${oldTagColor}`);
              break;
            }
          }
        }
        
        // Step 2: Find all tasks with the old tag BEFORE deleting
        let tasksWithOldTag = [];
        
        for (const space of spacesData.spaces || []) {
          // Get all tasks in folders
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
                  tasksWithOldTag.push({
                    id: task.id,
                    tags: task.tags,
                    spaceId: space.id
                  });
                  console.log(`[Worker] Found task ${task.id} with old tag "${tagId}"`);
                }
              }
            }
          }
          
          // Check space lists too
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
                tasksWithOldTag.push({
                  id: task.id,
                  tags: task.tags,
                  spaceId: space.id
                });
                console.log(`[Worker] Found task ${task.id} with old tag "${tagId}"`);
              }
            }
          }
        }
        
        console.log(`[Worker] Found ${tasksWithOldTag.length} tasks with old tag "${tagId}"`);
        
        // Step 3: Delete + Create in each space
        for (const space of spacesData.spaces || []) {
          console.log(`[Worker] Processing tag "${tagId}" -> "${name.trim()}" in space ${space.id}`);
          
          // Delete old tag
          const deleteResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/tag/${encodeURIComponent(tagId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
          });
          
          if (deleteResponse.ok) {
            console.log(`[Worker] Deleted old tag "${tagId}" from space ${space.id}`);
            
            // Create new tag with same color
            const createResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/tag`, {
              method: 'POST',
              headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ 
                tag: {
                  name: name.trim(),
                  tag_fg: oldTagColor,
                  tag_bg: oldTagColor
                }
              })
            });
            
            if (createResponse.ok) {
              processedSpaces++;
              console.log(`[Worker] Created new tag "${name.trim()}" in space ${space.id}`);
            } else {
              const createError = await createResponse.text();
              console.error(`[Worker] Failed to create new tag in space ${space.id}:`, createError);
              errors.push(`Create in ${space.name}: ${createError}`);
            }
          } else {
            const deleteError = await deleteResponse.text();
            console.error(`[Worker] Failed to delete old tag from space ${space.id}:`, deleteError);
            errors.push(`Delete from ${space.name}: ${deleteError}`);
          }
        }
        
        // Step 4: Re-assign new tag to all tasks that had the old tag
        let reassignedTasks = 0;
        
        for (const taskInfo of tasksWithOldTag) {
          console.log(`[Worker] Re-assigning new tag to task ${taskInfo.id}`);
          
          // Use Add Tag To Task API instead of PUT task
          const addTagResponse = await fetch(`https://api.clickup.com/api/v2/task/${taskInfo.id}/tag/${encodeURIComponent(name.trim())}`, {
            method: 'POST',
            headers: { 'Authorization': token }
          });
          
          if (addTagResponse.ok) {
            reassignedTasks++;
            console.log(`[Worker] Successfully re-assigned new tag to task ${taskInfo.id}`);
          } else {
            const taskError = await addTagResponse.text();
            console.error(`[Worker] Failed to re-assign tag to task ${taskInfo.id}:`, taskError);
            errors.push(`Task ${taskInfo.id}: ${taskError}`);
          }
        }
        
        console.log(`[Worker] Tag rename completed. Processed ${processedSpaces} spaces.`);
        
        if (processedSpaces > 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: `Tag renamed successfully! Processed ${processedSpaces} spaces and re-assigned to ${reassignedTasks} tasks.`,
            processedSpaces,
            reassignedTasks,
            totalTasksFound: tasksWithOldTag.length,
            method: 'delete-create-reassign',
            errors: errors.length > 0 ? errors : undefined
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Failed to rename tag in any space.`,
            errors
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      } catch (err) {
        console.error('[Worker] Tag rename error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }



    // Delete tag endpoint - Using ClickUp Space Tag API
    if (path.startsWith('/api/clickup/tag/') && request.method === 'DELETE') {
      console.log('[Worker] Tag delete requested');
      
      const tagId = path.split('/').pop();
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        // Get team and spaces
        const teamResponse = await fetch('https://api.clickup.com/api/v2/team', {
          headers: { 'Authorization': token }
        });
        const teamData = await teamResponse.json();
        const teamId = teamData.teams[0]?.id;
        
        if (!teamId) {
          return new Response(JSON.stringify({ error: 'No team found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
          headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let deletedSpaces = 0;
        let errors = [];
        
        // Delete tag from each space using ClickUp Space Tag API
        for (const space of spacesData.spaces || []) {
          console.log(`[Worker] Deleting tag "${tagId}" from space ${space.id}`);
          
          // Use ClickUp Delete Space Tag API
          const deleteResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/tag/${encodeURIComponent(tagId)}`, {
            method: 'DELETE',
            headers: {
              'Authorization': token
            }
          });
          
          if (deleteResponse.ok) {
            deletedSpaces++;
            console.log(`[Worker] Successfully deleted tag from space ${space.id}`);
          } else {
            const errorText = await deleteResponse.text();
            console.error(`[Worker] Failed to delete tag from space ${space.id}:`, errorText);
            errors.push(`Space ${space.name}: ${errorText}`);
          }
        }
        
        console.log(`[Worker] Tag delete completed. Deleted from ${deletedSpaces} spaces.`);
        
        if (deletedSpaces > 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: `Tag deleted successfully from ${deletedSpaces} spaces.`,
            deletedSpaces,
            errors: errors.length > 0 ? errors : undefined
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({ 
            success: false, 
            message: `Failed to delete tag from any space.`,
            errors
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      } catch (err) {
        console.error('[Worker] Tag delete error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 404 for unknown routes
    console.log('[Worker] 404 - Route not found:', path);
    return new Response('Not Found', { status: 404 });
  }
};
