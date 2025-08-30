// ClickUp OAuth2 access token kontrolü ve alma
(function handleClickUpAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {

        fetch('https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        })
        .then(res => res.json())
        .then(data => {
            if (data.access_token) {
                localStorage.setItem('clickup_access_token', data.access_token);
                window.location.replace(window.location.pathname);
            } else {
                showLoginSection();
            }
        })
        .catch(err => {
            console.error('[Auth] ClickUp token fetch error:', err);
            showLoginSection();
        });
    }
})();

// Login fonksiyonu
async function loginWithClickUp() {
    try {
        console.log('[Auth] Creating OAuth URL directly...');
        // Frontend'de OAuth URL oluştur (Cloudflare challenge'ı geçmek için)
        const CLICKUP_CLIENT_ID = 'E5Y5P88KKK742V28R31AR7EIWR3J0CWU';
        const CLICKUP_REDIRECT_URI = window.location.origin + '/';
        
        const oauthUrl = `https://app.clickup.com/api?client_id=${encodeURIComponent(CLICKUP_CLIENT_ID)}&redirect_uri=${encodeURIComponent(CLICKUP_REDIRECT_URI)}`;
        
        console.log('[Auth] OAuth URL:', oauthUrl);
        window.location.href = oauthUrl;
    } catch (e) {
        console.error('[Auth] Failed to get OAuth URL:', e);
    }
}

// Login section'ı göster
function showLoginSection() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('tag-manager-section').style.display = 'none';
}

// Tag manager section'ı göster
function showTagManagerSection() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('tag-manager-section').style.display = 'block';
}

// ClickUp görevlerini UI'a dönüştür
function mapClickUpTaskToUI(task) {
    return {
        id: task.id,
        title: task.name,
        type: task.tags && task.tags.length > 0 ? task.tags[0].name : 'Task',
        priority: task.priority && task.priority.priority ? task.priority.priority : 'Medium',
        status: task.status && task.status.status ? task.status.status : (task.status || 'To Do'),
        assignee: task.assignees && task.assignees.length > 0 ? (task.assignees[0].username || task.assignees[0].email || 'Unknown') : 'Unassigned',
        dueDate: task.due_date ? new Date(Number(task.due_date)).toISOString().slice(0, 10) : '',
        // Görseldeki gibi task ID formatı (örn: DB-501, DB-502)
        displayId: task.id ? `${task.tags && task.tags.length > 0 ? task.tags[0].name.toUpperCase() : 'TASK'}-${task.id.slice(-3)}` : task.id,
        // Tag bilgilerini sakla
        tags: task.tags || []
    };
}

class ClickUpTagManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedTag = null;
        this.selectedTags = [];
        this.searchTerm = '';
        this.groups = [{ name: 'All', open: true }];
        this.activeFilter = {};
        this.tags = [];
        console.log('[TM] Constructed ClickUpTagManager with containerId =', containerId, 'container exists =', !!this.container);
        this.initialize();
    }

    async initialize() {
        // Token kontrolü
        const token = localStorage.getItem('clickup_access_token');
        console.log('[TM] initialize() token present =', !!token, 'length =', token ? token.length : 0);
        if (!token) {
            console.warn('[TM] No token found. Showing login section.');
            showLoginSection();
            return;
        }
        
        console.log('[TM] Token found. Showing Tag Manager section and loading tags...');
        showTagManagerSection();
        await this.loadTagsFromClickUp();
        this.render();
        this.attachEventListeners();
        this.setupSearchAndFilter();
        
        // Initialize drag and drop after rendering
        if (typeof initializeDragAndDrop === 'function') {
            initializeDragAndDrop();
        }
        
        // Create color filter options after tags are loaded
        this.createColorFilterOptions();
    }

    async loadTagsFromClickUp() {
        // Loading durumunu göster
        this.showLoading();
        
        // Kullanıcının access token'ı ile ClickUp API'den etiketleri çek
        const token = localStorage.getItem('clickup_access_token');
        if (!token) {
            console.warn('[TM] loadTagsFromClickUp(): No token, skipping fetch');
            this.hideLoading();
            return;
        }
        // ClickUp API'den tag'leri çek (teamId otomatik olarak alınacak)
        const teamId = null; // null olarak bırak, backend otomatik olarak ilk team'i kullanacak
        try {
            console.log('[TM] Fetching tags from backend...', { hasToken: !!token, teamId });
            const res = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tags?token=${token}${teamId ? `&teamId=${teamId}` : ''}`);
            console.log('[TM] /api/clickup/tags response ok =', res.ok, 'status =', res.status);
            if (!res.ok) {
                this.hideLoading();
                return;
            }
            const data = await res.json();
            console.log('[TM] Tags payload:', data);
            this.tags = data.tags || [];
            console.log('[TM] Tags loaded. count =', this.tags.length);
            
            // Loading durumunu gizle
            this.hideLoading();
        } catch (e) {
            console.error('[TM] Error while loading tags:', e);
            this.tags = [];
            this.hideLoading();
        }
    }

    render() {
        console.log('[TM] Rendering UI... tags count =', this.tags.length, 'selectedTag =', this.selectedTag ? this.selectedTag.name : null);
        this.renderTagList();
        this.renderTagDetails();
    }

    renderTagList() {
        // Sadece ClickUp'tan gelen tag'leri listele
        const allTagsList = this.container.querySelector('#all-tags-list');
        if (!allTagsList) {
            console.warn('[TM] renderTagList(): #all-tags-list not found in container');
            return;
        }
        allTagsList.innerHTML = '';
        console.log('[TM] Rendering tag list. count =', this.tags.length);
        this.tags.forEach(tag => {
            const tagElement = document.createElement('div');
            tagElement.className = 'tag-item';
            tagElement.id = `tag-${tag.id}`;
            tagElement.setAttribute('draggable', 'true');
            tagElement.innerHTML = `
                <div class="tag-content">
                    <div class="tag-color-dot" style="background-color: ${tag.color || '#4f8cff'}"></div>
                    <div class="tag-main-info">
                        <div class="tag-name">${tag.name}</div>
                        <div class="tag-extra">#${tag.id}</div>
                    </div>
                    <div class="tag-actions">
                        <button class="tag-action-btn edit-btn" onclick="event.stopPropagation(); tagManager.editTag('${tag.id}', '${tag.name}')" title="Edit tag">
                            <span class="action-icon">✏️</span>
                        </button>
                        <button class="tag-action-btn delete-btn" onclick="event.stopPropagation(); tagManager.deleteTag('${tag.id}', '${tag.name}')" title="Delete tag">
                            <span class="action-icon">🗑️</span>
                        </button>
                    </div>
                </div>
            `;
            tagElement.onclick = () => {
                console.log('[TM] Tag clicked:', tag);
                console.log('[TM] Tag ID:', tag.id);
                console.log('[TM] Tag name:', tag.name);
                // Remove selected class from all tags
                this.container.querySelectorAll('.tag-item').forEach(item => {
                    item.classList.remove('selected');
                });
                // Add selected class to clicked tag
                tagElement.classList.add('selected');
                this.selectedTag = tag;
                
                // Show loading for right panel
                this.showRightPanelLoading();
                
                // Render tag details (async)
                this.renderTagDetails();
            };
            allTagsList.appendChild(tagElement);
        });
        
        // Tag'lar render edildikten sonra drag-drop'u başlat
        setTimeout(() => {
            if (typeof initializeDragAndDrop === 'function') {
                initializeDragAndDrop();
            }
        }, 100);
        
        // Grup filtreleme seçeneklerini güncelle
        this.updateGroupFilterOptions();
    }

    async renderTagDetails() {
        const detailsPanel = this.container.querySelector('#tag-details');
        const taggedItemsPanel = this.container.querySelector('#tagged-items');
        if (!this.selectedTag) {
            console.log('[TM] No tag selected. Showing empty selection message.');
            detailsPanel.innerHTML = `<div class="no-selection-message">Select a tag</div>`;
            taggedItemsPanel.innerHTML = '';
            return;
        }
        // ClickUp API'den bu tag ile ilişkili görevleri çek
        const token = localStorage.getItem('clickup_access_token');
        console.log('[TM] Fetching tasks for selected tag:', { tagName: this.selectedTag.name, tagId: this.selectedTag.id, hasToken: !!token });
        let taggedItems = [];
        
        if (token) {
            try {
                // Tüm list'lerden task'ları çek ve sadece bu tag'e sahip olanları filtrele
                const res = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tasks?token=${token}&listId=all`);
                console.log('[TM] /api/clickup/tasks response ok =', res.ok, 'status =', res.status);
                if (res.ok) {
                    const data = await res.json();
                    const allTasks = data.tasks || [];
                    console.log('[TM] All tasks loaded:', allTasks.length);
                    
                    // Sadece seçilen tag'e sahip task'ları filtrele
                    console.log('[TM] Selected tag ID:', this.selectedTag.id);
                    console.log('[TM] All tasks count:', allTasks.length);
                    
                    const filteredTasks = allTasks.filter(task => {
                        const hasTag = task.tags && task.tags.some(tag => tag.name === this.selectedTag.id);
                        if (hasTag) {
                            console.log('[TM] Task', task.id, 'has selected tag:', this.selectedTag.id);
                        }
                        return hasTag;
                    });
                    console.log('[TM] Filtered tasks for tag', this.selectedTag.id, ':', filteredTasks.length);
                    
                    taggedItems = filteredTasks.map(mapClickUpTaskToUI);
                    console.log('[TM] Tagged items mapped. count =', taggedItems.length);
                }
            } catch (e) {
                console.error('[TM] Error while loading tasks:', e);
            }
        } else {
            console.warn('[TM] Missing token. token?', !!token);
        }
        detailsPanel.innerHTML = `
            <div class="tag-details-header">
                <div class="tag-details-color" style="background-color: ${this.selectedTag.color || '#4f8cff'}"></div>
                <div class="tag-details-info">
                    <h3 class="tag-details-title">${this.selectedTag.name}</h3>
                    <div class="tag-details-meta">
                        <div class="tag-meta-item">
                            <span>🏢</span>
                            <span>#${this.selectedTag.id}</span>
                        </div>
                        <div class="tag-meta-item">
                            <span>👤</span>
                            <span>${this.selectedTag.creator_name || this.selectedTag.creator_id || 'Unknown'}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="tag-details-stats">
                <div class="stat-item">
                    <div class="stat-value">${taggedItems.length}</div>
                    <div class="stat-label">Related Tasks</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">Active</div>
                    <div class="stat-label">Status</div>
                </div>
            </div>
        `;
        
        taggedItemsPanel.innerHTML = `
            <div class="tagged-items-header">
                <span class="task-count">${taggedItems.length} tasks</span>
            </div>
            ${taggedItems.length > 0 ? taggedItems.map(item => `
                <div class="tagged-item">
                    <div class="item-header">
                        <span class="item-id">${item.displayId || item.id}</span>
                        <div class="item-badges">
                            <span class="item-type">${item.type}</span>
                            <span class="item-priority ${item.priority.toLowerCase()}">${item.priority}</span>
                        </div>
                    </div>
                    <div class="item-title">${item.title}</div>
                    <div class="item-details">
                        <span class="item-status ${item.status.toLowerCase().replace(' ', '-')}">${item.status}</span>
                        <div class="item-meta">
                            <span class="item-assignee">👤 ${item.assignee}</span>
                            <span class="item-due-date">📅 ${item.dueDate}</span>
                        </div>
                    </div>
                </div>
            `).join('') : `<div class="no-data-message">No tasks found</div>`}
        `;
        

    }

    setupSearchAndFilter() {
        const searchInput = this.container.querySelector('#search-input');
        const allButton = this.container.querySelector('.btn-all');
        const filterBtn = this.container.querySelector('#filter-btn');
        const filterPanel = this.container.querySelector('#filter-panel');
        const applyFilter = this.container.querySelector('#apply-filter');
        const clearFilter = this.container.querySelector('#clear-filter');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterTags(e.target.value);
            });
        }
        
        // All tags toggle (sadece "All" alanına tıklayınca)
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        if (allTagsToggle) {
            allTagsToggle.addEventListener('click', (e) => {
                // Eğer + butonuna tıklanmadıysa toggle yap
                if (!e.target.closest('.btn-add-group')) {
                    this.toggleAllTags();
                }
            });
        }

        // Grup oluşturma butonu
        const addGroupBtn = this.container.querySelector('#add-group-btn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // "All" toggle'ını tetiklemesin
                this.createNewGroup();
            });
        }
        
        // Filter panel toggle - HTML onclick kullanıldığı için burada event listener eklemiyoruz

        
        // Apply filter
        if (applyFilter) {
            applyFilter.addEventListener('click', () => {
                this.applyFilters();
                // Panel'i kapatma - kalıcı olarak açık kalsın
            });
        }
        
        // Clear filter
        if (clearFilter) {
            clearFilter.addEventListener('click', () => {
                this.clearFilters();
                // Panel'i kapatma - kalıcı olarak açık kalsın
            });
        }
        
        // Group filter change
        const groupFilter = this.container.querySelector('#group-filter');
        if (groupFilter) {
            groupFilter.addEventListener('change', (e) => {
                this.applyFilters();
            });
        }
    }
    
    // Dinamik renk seçenekleri oluştur
    createColorFilterOptions() {
        const colorDropdown = this.container.querySelector('#color-filter-dropdown');
        if (!colorDropdown) return;
        
        // Mevcut tag'lerden benzersiz renkleri topla
        const uniqueColors = new Set();
        this.tags.forEach(tag => {
            if (tag.color) {
                uniqueColors.add(tag.color);
            }
        });
        
        // "All Colors" seçeneğini koru, diğerlerini temizle
        const allColorsOption = colorDropdown.querySelector('[data-color="all"]');
        colorDropdown.innerHTML = '';
        colorDropdown.appendChild(allColorsOption);
        
        // Her benzersiz renk için seçenek oluştur
        uniqueColors.forEach(color => {
            const colorOption = document.createElement('div');
            colorOption.className = 'color-option';
            colorOption.setAttribute('data-color', color);
            colorOption.innerHTML = `
                <span class="color-dot" style="background-color: ${color}"></span>
                <span>${color}</span>
            `;
            
            // Renk seçeneğine tıklama olayı ekle
            colorOption.addEventListener('click', () => {
                this.selectColor(color);
            });
            
            colorDropdown.appendChild(colorOption);
        });
        
        // "All Colors" seçeneğine tıklama olayı ekle
        allColorsOption.addEventListener('click', () => {
            this.selectColor('all');
        });
        
        // Dropdown toggle olayı ekle
        const colorDisplay = this.container.querySelector('#color-filter-display');
        if (colorDisplay) {
            colorDisplay.addEventListener('click', () => {
                this.toggleColorDropdown();
            });
        }
        

    }
    
    // Renk seç
    selectColor(color) {
        const selectedColorDot = this.container.querySelector('#selected-color-dot');
        const selectedColorText = this.container.querySelector('#selected-color-text');
        const colorDropdown = this.container.querySelector('#color-filter-dropdown');
        
        if (color === 'all') {
            selectedColorDot.style.backgroundColor = 'transparent';
            selectedColorText.textContent = 'All Colors';
        } else {
            selectedColorDot.style.backgroundColor = color;
            selectedColorText.textContent = color;
        }
        
        // Dropdown'ı kapat
        colorDropdown.style.display = 'none';
        
        // Seçili rengi sakla
        this.selectedColor = color;
        

    }
    
    // Renk dropdown'ını aç/kapat
    toggleColorDropdown() {
        const colorDropdown = this.container.querySelector('#color-filter-dropdown');
        const currentDisplay = colorDropdown.style.display;
        colorDropdown.style.display = currentDisplay === 'none' ? 'block' : 'none';
    }
    
    // Renk için kontrast renk hesapla (siyah veya beyaz)
    getContrastColor(hexColor) {
        // Hex'i RGB'ye çevir
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        // Luminance hesapla
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Koyu arka plan için beyaz, açık arka plan için siyah
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }
    
    applyFilters() {
        const groupFilter = this.container.querySelector('#group-filter');
        
        if (!groupFilter) {
            console.log('[FE] Group filter element not found');
            return;
        }
        
        const selectedGroup = groupFilter.value;
        const selectedColor = this.selectedColor || 'all';
        
        const tagItems = this.container.querySelectorAll('.tag-item');
        
        tagItems.forEach(tagItem => {
            const tagColorDot = tagItem.querySelector('.tag-color-dot');
            const tagColor = tagColorDot ? tagColorDot.style.backgroundColor : '';
            
            // Grup filtrelemesi - tag'ın hangi grupta olduğunu kontrol et
            let showByGroup = true;
            if (selectedGroup !== 'all') {
                const parentGroup = tagItem.closest('.group-item');
                const tagGroup = parentGroup ? parentGroup.getAttribute('data-group') : null;
                showByGroup = tagGroup === selectedGroup;
            }
            
            // Renk filtrelemesi
            let showByColor = selectedColor === 'all' || this.colorMatches(tagColor, selectedColor);
            

            
            tagItem.style.display = (showByGroup && showByColor) ? 'block' : 'none';
        });
        

    }
    
    colorMatches(backgroundColor, selectedColor) {
        // Eğer "all" seçilmişse her zaman true döndür
        if (selectedColor === 'all') {
            return true;
        }
        
        if (backgroundColor && selectedColor) {
            // RGB formatını hex'e çevir
            let bgHex = backgroundColor;
            if (backgroundColor.startsWith('rgb(')) {
                bgHex = this.rgbToHex(backgroundColor);
            }
            
            // Renk kodlarını normalize et (büyük harf yap)
            const normalizedBg = bgHex.toUpperCase();
            const normalizedSelected = selectedColor.toUpperCase();
            

            
            return normalizedBg === normalizedSelected;
        }
        
        return false;
    }
    
    // RGB'yi hex'e çevir
    rgbToHex(rgb) {
        // rgb(110, 86, 207) -> #6E56CF
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        }
        return rgb;
    }
    
    clearFilters() {
        const groupFilter = this.container.querySelector('#group-filter');
        
        if (groupFilter) groupFilter.value = 'all';
        
        // Renk seçimini "All Colors"a sıfırla
        this.selectColor('all');
        
        this.showAllTags();
        

    }
    
    filterTags(searchTerm) {
        const tagItems = this.container.querySelectorAll('.tag-item');
        const lowerSearchTerm = searchTerm.toLowerCase();
        
        tagItems.forEach(tagItem => {
            const tagName = tagItem.querySelector('.tag-name').textContent.toLowerCase();
            const tagId = tagItem.querySelector('.tag-extra').textContent.toLowerCase();
            
            if (tagName.includes(lowerSearchTerm) || tagId.includes(lowerSearchTerm)) {
                tagItem.style.display = 'block';
            } else {
                tagItem.style.display = 'none';
            }
        });
    }
    
    showAllTags() {
        const tagItems = this.container.querySelectorAll('.tag-item');
        tagItems.forEach(tagItem => {
            tagItem.style.display = 'block';
        });
        
        const searchInput = this.container.querySelector('#search-input');
        if (searchInput) {
            searchInput.value = '';
        }
    }
    
    // All tags toggle
    toggleAllTags() {
        const allTagsList = this.container.querySelector('#all-tags-list');
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        
        if (allTagsList && allTagsToggle) {
            const currentDisplay = allTagsList.style.display;
            const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
            
            allTagsList.style.display = newDisplay;
            
            if (newDisplay === 'block') {
                allTagsToggle.classList.add('expanded');
            } else {
                allTagsToggle.classList.remove('expanded');
            }
            
    
        }
    }
    
    // Grup toggle
    toggleGroup(groupName) {
        const groupElement = this.container.querySelector(`[data-group="${groupName}"]`);
        if (groupElement) {
            const groupHeader = groupElement.querySelector('.group-header');
            const groupTags = groupElement.querySelector('.group-tags');
            const toggleArrow = groupHeader.querySelector('.group-toggle-arrow');
            
            if (groupTags && groupHeader && toggleArrow) {
                const currentDisplay = groupTags.style.display;
                const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
                
                groupTags.style.display = newDisplay;
                
                if (newDisplay === 'block') {
                    groupHeader.classList.add('expanded');
                    toggleArrow.style.transform = 'rotate(180deg)';
                } else {
                    groupHeader.classList.remove('expanded');
                    toggleArrow.style.transform = 'rotate(0deg)';
                }
                
        
            }
        }
    }
    
    // Yeni grup oluştur
    createNewGroup() {
        const groupName = prompt('Grup adını girin:');
        if (groupName && groupName.trim()) {
            this.addGroup(groupName.trim());
        }
    }
    
    // Grubu ekle
    addGroup(groupName) {
        const tagsFilter = this.container.querySelector('.tags-filter');
        if (!tagsFilter) {
            console.log('[FE] Tags filter container not found');
            return;
        }
        
        // Yeni grup elementi oluştur
        const groupElement = document.createElement('div');
        groupElement.className = 'group-item';
        groupElement.setAttribute('data-group', groupName);
        groupElement.innerHTML = `
            <div class="group-header" onclick="tagManager.toggleGroup('${groupName}')">
                <span class="group-name">${groupName}</span>
                <span class="group-toggle-arrow">▼</span>
                <button class="btn-remove-group" onclick="event.stopPropagation(); tagManager.removeGroup('${groupName}')">×</button>
            </div>
            <div class="group-tags" data-group="${groupName}" style="display: none;">
                <!-- Bu gruba sürüklenen tag'lar buraya gelecek -->
            </div>
        `;
        
        // "All" toggle'dan sonra ekle (all-tags-list'ten önce)
        const allTagsList = tagsFilter.querySelector('#all-tags-list');
        if (allTagsList) {
            allTagsList.parentNode.insertBefore(groupElement, allTagsList.nextSibling);
    
            
            // Grup filtreleme dropdown'ını güncelle
            this.updateGroupFilterOptions();
            
            // Yeni grup oluşturulduktan sonra drag-drop'u yeniden başlat
            setTimeout(() => {
                if (typeof initializeDragAndDrop === 'function') {
                    initializeDragAndDrop();
                }
            }, 100);
        } else {
            console.log('[FE] All tags list not found');
        }
    }
    
    // Grubu kaldır
    removeGroup(groupName) {
        const groupElement = this.container.querySelector(`[data-group="${groupName}"]`);
        if (groupElement) {
            // Grubun içindeki tag'ları "All" bölümüne geri taşı
            const groupTags = groupElement.querySelectorAll('.tag-item');
            const allTagsList = this.container.querySelector('#all-tags-list');
            
            groupTags.forEach(tag => {
                if (allTagsList) {
                    allTagsList.appendChild(tag);
                }
            });
            
            // Grubu kaldır
            groupElement.remove();
    
            
            // Grup filtreleme dropdown'ını güncelle
            this.updateGroupFilterOptions();
        }
    }
    
    // Grup filtreleme seçeneklerini güncelle
    updateGroupFilterOptions() {
        const groupFilter = this.container.querySelector('#group-filter');
        if (!groupFilter) {
            console.log('[FE] Group filter element not found');
            return;
        }
        
        // Mevcut seçenekleri temizle (sadece "All" kalsın)
        groupFilter.innerHTML = '<option value="all">All</option>';
        
        // Mevcut grupları bul ve ekle
        const groupItems = this.container.querySelectorAll('.group-item');
        groupItems.forEach(groupItem => {
            const groupName = groupItem.getAttribute('data-group');
            if (groupName) {
                const option = document.createElement('option');
                option.value = groupName;
                option.textContent = groupName;
                groupFilter.appendChild(option);
            }
        });
        
        console.log('[FE] Group filter options updated. Groups found:', groupItems.length);
    }
    
    // Grup filtreleme fonksiyonu
    filterByGroup(selectedGroup) {
        const tagItems = this.container.querySelectorAll('.tag-item');
        
        tagItems.forEach(tagItem => {
            if (selectedGroup === 'all') {
                // Tüm tag'ları göster
                tagItem.style.display = 'block';
            } else {
                // Tag'ın hangi grupta olduğunu kontrol et
                const parentGroup = tagItem.closest('.group-item');
                const tagGroup = parentGroup ? parentGroup.getAttribute('data-group') : null;
                
                if (tagGroup === selectedGroup) {
                    tagItem.style.display = 'block';
                } else {
                    tagItem.style.display = 'none';
                }
            }
        });
        
        console.log('[FE] Filtered by group:', selectedGroup);
    }
    
    // Loading durumunu göster
    showLoading() {
        const loadingContainer = this.container.querySelector('#loading-container');
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        
        if (loadingContainer) {
            loadingContainer.style.display = 'flex';
        }
        if (allTagsToggle) {
            allTagsToggle.style.display = 'none';
        }
        
        console.log('[FE] Loading indicator shown');
    }
    
    // Loading durumunu gizle
    hideLoading() {
        const loadingContainer = this.container.querySelector('#loading-container');
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        
        if (loadingContainer) {
            loadingContainer.style.display = 'none';
        }
        if (allTagsToggle) {
            allTagsToggle.style.display = 'flex';
        }
        
        console.log('[FE] Loading indicator hidden');
    }
    
    // Right panel loading durumunu göster
    showRightPanelLoading() {
        const tagDetails = this.container.querySelector('#tag-details');
        const taggedItems = this.container.querySelector('#tagged-items');
        
        if (tagDetails) {
            tagDetails.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading tag details...</div>
                </div>
            `;
        }
        if (taggedItems) {
            taggedItems.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading related tasks...</div>
                </div>
            `;
        }
        
        console.log('[FE] Right panel loading indicators shown');
    }
    
    // Right panel loading durumunu gizle
    hideRightPanelLoading() {
        // Loading'ler renderTagDetails() fonksiyonunda otomatik olarak güncellenir
        console.log('[FE] Right panel loading indicators will be replaced by content');
    }
    
    // Tag düzenleme - Using Delete + Create workaround
    async editTag(tagId, currentName) {
        console.log('[TM] editTag called:', { tagId, currentName });
        
        // Inform user about the workaround
        const confirmed = confirm(
            `🔄 Smart Tag Rename\n\n` +
            `ClickUp API doesn't support direct tag renaming.\n\n` +
            `Our smart workaround:\n` +
            `1. Find all tasks with tag: "${currentName}"\n` +
            `2. Delete the old tag from space\n` +
            `3. Create new tag with same color\n` +
            `4. Automatically re-assign new tag to all found tasks\n\n` +
            `✅ Your tasks will keep their tags!\n` +
            `The tag name will change but stay assigned to the same tasks.\n\n` +
            `Do you want to continue?`
        );
        
        if (!confirmed) {
            console.log('[TM] User cancelled tag rename');
            return;
        }
        
        const newName = prompt('Enter new tag name:', currentName);
        console.log('[TM] New name entered:', newName);
        
        if (newName && newName.trim() && newName.trim() !== currentName) {
            console.log('[TM] Starting tag rename using Delete+Create workaround...');
            try {
                const token = localStorage.getItem('clickup_access_token');
                if (!token) {
                    alert('No access token found. Please login again.');
                    return;
                }
                
                console.log('[TM] Making PUT request to rename tag using Delete+Create...');
                const response = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tag/${tagId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: newName.trim() })
                });
                
                console.log('[TM] Rename response:', response.status, response.ok);
                
                if (response.ok) {
                    const responseData = await response.json();
                    console.log('[TM] Rename successful:', responseData);
                    
                    // Show success message with details
                    alert(`✅ Smart Tag Rename Completed!\n\n` +
                          `📊 Results:\n` +
                          `• Processed ${responseData.processedSpaces || 0} spaces\n` +
                          `• Found ${responseData.totalTasksFound || 0} tasks with old tag\n` +
                          `• Re-assigned to ${responseData.reassignedTasks || 0} tasks\n` +
                          `• Method: ${responseData.method || 'delete-create-reassign'}\n\n` +
                          `🎉 Your tasks still have the tag with the new name!\n\n` +
                          `Refreshing tag list...`);
                    
                    // Refresh tags from server
                    await this.loadTagsFromClickUp();
                    this.render();
                    
                } else {
                    const errorData = await response.json();
                    console.error('[TM] Rename failed:', errorData);
                    alert(`❌ Failed to rename tag: ${errorData.message || errorData.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('[FE] Error renaming tag:', error);
                alert('❌ Failed to rename tag. Please try again.');
            }
        }
    }
    
    // Tag silme
    async deleteTag(tagId, tagName) {
        console.log('[TM] deleteTag called:', { tagId, tagName });
        const confirmDelete = confirm(`Are you sure you want to delete tag "${tagName}"? This action cannot be undone.`);
        console.log('[TM] Delete confirmed:', confirmDelete);
        
        if (confirmDelete) {
            console.log('[TM] Starting tag delete API call...');
            try {
                const token = localStorage.getItem('clickup_access_token');
                if (!token) {
                    alert('No access token found. Please login again.');
                    return;
                }
                
                console.log('[TM] Making DELETE request to delete tag...');
                const response = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tag/${tagId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                console.log('[TM] Delete response:', response.status, response.ok);
                
                if (response.ok) {
                    const responseData = await response.json();
                    console.log('[TM] Delete successful:', responseData);
                    
                    // Remove from local tags array
                    this.tags = this.tags.filter(t => t.id !== tagId);
                    
                    // Re-render tag list
                    this.renderTagList();
                    
                    // If this tag is currently selected, clear selection
                    if (this.selectedTag && this.selectedTag.id === tagId) {
                        this.selectedTag = null;
                        this.renderTagDetails();
                    }
                    
                    alert('Tag deleted successfully!');
                } else {
                    const errorData = await response.json();
                    alert(`Failed to delete tag: ${errorData.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('[FE] Error deleting tag:', error);
                alert('Failed to delete tag. Please try again.');
            }
        }
    }

    attachEventListeners() {
        // Arama, filtreleme, vs. eklenebilir
        console.log('[TM] attachEventListeners() called');
        
        // Manuel event listener'ı kaldır - sadece HTML onclick kullan
    }
}

// Global filter panel toggle function
function toggleFilterPanel() {
    console.log('[FE] toggleFilterPanel() called');
    const filterPanel = document.querySelector('#filter-panel');
    const filterBtn = document.querySelector('#filter-btn');
    
    if (filterPanel) {
        // Panel'i aç/kapat
        const currentDisplay = filterPanel.style.display;
        const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
        filterPanel.style.display = newDisplay;
        
        // Buton ikonunu değiştir
        if (newDisplay === 'block') {
            filterBtn.textContent = '▲';
        } else {
            filterBtn.textContent = '▼';
        }
        
        console.log('[FE] Panel toggled:', newDisplay);
    } else {
        console.log('[FE] Filter panel not found!');
    }
}

// Logout fonksiyonu
function logout() {
    console.log('[Auth] Logging out. Clearing token and showing login section.');
    localStorage.removeItem('clickup_access_token');
    showLoginSection();
}

// Uygulamayı başlat
const tagManager = new ClickUpTagManager('tag-manager-section'); 