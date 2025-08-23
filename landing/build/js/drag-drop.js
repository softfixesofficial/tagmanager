// Enable drag-and-drop for tags and handle dropping into inactive list

// Function to initialize drag and drop
function initializeDragAndDrop() {
    // Get all tag elements and group drop zones
    const tags = document.querySelectorAll('.tag-item');
    const groupTags = document.querySelectorAll('.group-tags');



    // Make tags draggable
    tags.forEach(tag => {
        // Set draggable attribute and add drag event listeners
        tag.setAttribute('draggable', 'true');
        
        tag.addEventListener('dragstart', (e) => {
    
            tag.classList.add('dragging');
            e.dataTransfer.setData('text/plain', tag.id);
        });

        tag.addEventListener('dragend', () => {
    
            tag.classList.remove('dragging');
        });
    });



    // Handle drop zone events for group tags
    groupTags.forEach(groupZone => {
        groupZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            groupZone.classList.add('drag-over');
        });

        groupZone.addEventListener('dragleave', () => {
            groupZone.classList.remove('drag-over');
        });

        groupZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            groupZone.classList.remove('drag-over');
            
            const tagId = e.dataTransfer.getData('text/plain');
            const draggedTag = document.getElementById(tagId);
            
            if (draggedTag) {
                // Move tag to group
                draggedTag.parentNode.removeChild(draggedTag);
                groupZone.appendChild(draggedTag);
                draggedTag.style.animation = 'none';
                draggedTag.offsetHeight; // Trigger reflow
                draggedTag.style.animation = 'tagDropped 0.3s ease';
                
    
            }
        });
    });

    // Handle drop zone events for all tags list (return to all)
    const allTagsList = document.querySelector('#all-tags-list');
    if (allTagsList) {
        allTagsList.addEventListener('dragover', (e) => {
            e.preventDefault();
            allTagsList.classList.add('drag-over');
        });

        allTagsList.addEventListener('dragleave', () => {
            allTagsList.classList.remove('drag-over');
        });

        allTagsList.addEventListener('drop', async (e) => {
            e.preventDefault();
            allTagsList.classList.remove('drag-over');
            
            const tagId = e.dataTransfer.getData('text/plain');
            const draggedTag = document.getElementById(tagId);
            
            if (draggedTag) {
                // Move tag back to all tags
                draggedTag.parentNode.removeChild(draggedTag);
                allTagsList.appendChild(draggedTag);
                draggedTag.style.animation = 'none';
                draggedTag.offsetHeight; // Trigger reflow
                draggedTag.style.animation = 'tagDropped 0.3s ease';
                
    
            }
        });
    }
}

// Initialize drag and drop when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeDragAndDrop();
});

// Add animation for dropped tags
const style = document.createElement('style');
style.textContent = `
    @keyframes tagDropped {
        0% {
            transform: scale(1.1);
            opacity: 0.8;
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style); 