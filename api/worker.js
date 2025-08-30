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
                      allTags.push(tagData);
                    } else {
                      existingTag.task_count++;
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
                    allTags.push(tagData);
                  } else {
                    existingTag.task_count++;
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

    // Update tag endpoint
    if (path.startsWith('/api/clickup/tag/') && request.method === 'PUT') {
      console.log('[Worker] Tag update requested');
      
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

        // Find all tasks with the old tag and update them
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
          headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let updatedTasks = 0;
        let oldTagColor = null;
        
        // First pass: find the old tag color
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
                  const oldTag = task.tags.find(t => t.name === tagId);
                  if (oldTag && oldTag.color) {
                    oldTagColor = oldTag.color;
                    break;
                  }
                }
              }
              if (oldTagColor) break;
            }
            if (oldTagColor) break;
          }
          if (oldTagColor) break;
          
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
                const oldTag = task.tags.find(t => t.name === tagId);
                if (oldTag && oldTag.color) {
                  oldTagColor = oldTag.color;
                  break;
                }
              }
            }
            if (oldTagColor) break;
          }
          if (oldTagColor) break;
        }
        
        // Second pass: update all tasks with the old tag
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
                  // Remove old tag and add new tag with same color
                  const updatedTags = task.tags.filter(tag => tag.name !== tagId);
                  updatedTags.push({
                    name: name.trim(),
                    color: oldTagColor || '#4f8cff'
                  });
                  
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
                    console.log(`[Worker] Updated task ${task.id} with new tag name`);
                  } else {
                    console.error(`[Worker] Failed to update task ${task.id}:`, await updateResponse.text());
                  }
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
                // Remove old tag and add new tag with same color
                const updatedTags = task.tags.filter(tag => tag.name !== tagId);
                updatedTags.push({
                  name: name.trim(),
                  color: oldTagColor || '#4f8cff'
                });
                
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
                  console.log(`[Worker] Updated task ${task.id} with new tag name`);
                } else {
                  console.error(`[Worker] Failed to update task ${task.id}:`, await updateResponse.text());
                }
              }
            }
          }
        }
        
        console.log(`[Worker] Tag update completed. Updated ${updatedTasks} tasks.`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Tag updated successfully. Updated ${updatedTasks} tasks.`,
          updatedTasks 
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        console.error('[Worker] Tag update error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Delete tag endpoint
    if (path.startsWith('/api/clickup/tag/') && request.method === 'DELETE') {
      console.log('[Worker] Tag delete requested');
      
      const tagId = path.split('/').pop();
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');
      
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

        // Tag delete logic (routes.js'den kopyalandı)
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
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Tag deleted from ClickUp: ${tagId}`,
          updatedTasks 
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
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
