import { DocumentFolder, DocumentCategory } from '../../types/document';
import Badge from '../ui/Badge';
import './CategoryTabs.css';

interface CategoryTabsProps {
  categories: DocumentFolder[];
  activeCategory: DocumentCategory;
  onCategoryChange: (category: DocumentCategory) => void;
  documentCounts: Record<DocumentCategory, number>;
}

function CategoryTabs({ 
  categories, 
  activeCategory, 
  onCategoryChange,
  documentCounts 
}: CategoryTabsProps) {
  return (
    <div className="category-tabs">
      {categories.map((folder) => {
        const isActive = folder.category === activeCategory;
        const count = documentCounts[folder.category] || 0;

        return (
          <button
            key={folder.category}
            className={`category-tab ${isActive ? 'category-tab--active' : ''}`}
            onClick={() => onCategoryChange(folder.category)}
            title={folder.description}
          >
            <span className="category-tab__icon">{folder.icon}</span>
            <span className="category-tab__label">{folder.category}</span>
            <Badge variant="default" size="sm">
              {count}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

export default CategoryTabs;
