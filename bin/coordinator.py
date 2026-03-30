#!/usr/bin/env python3
"""Entry point for Twitter Bookmark Coordinator.

Usage:
    python3 bin/coordinator.py [options]
    cd /path/to/x-bookmark-reports && python3 bin/coordinator.py --help
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def get_project_root() -> Path:
    """Get project root directory (parent of bin/)."""
    return Path(__file__).parent.parent


def setup_python_path(project_root: Path) -> None:
    """Add project root to Python path for imports."""
    root_str = str(project_root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Process Twitter bookmarks and generate reports",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                      Run with default settings (incremental)
  %(prog)s --full               Force full reprocessing (skip cache)
  %(prog)s --limit 10           Process only first 10 bookmarks
  %(prog)s --id 2037365525542797367  Process a single bookmark
  %(prog)s --format html        Generate HTML report
  %(prog)s --bookmarks /path/to/bookmarks.json  Use custom bookmarks file
  %(prog)s --output ./reports   Use custom output directory
        """,
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Process all bookmarks (skip cache)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of bookmarks to process",
    )
    parser.add_argument(
        "--id",
        type=str,
        default=None,
        help="Process a single bookmark by tweet ID",
    )
    parser.add_argument(
        "--format",
        choices=["markdown", "html"],
        default="markdown",
        help="Report format (default: markdown)",
    )
    parser.add_argument(
        "--bookmarks",
        type=Path,
        default=None,
        help="Path to bookmarks JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output directory for reports",
    )
    parser.add_argument(
        "--chdir",
        action="store_true",
        help="Change to project root directory before running",
    )

    args = parser.parse_args()

    project_root = get_project_root()

    if args.chdir:
        os.chdir(project_root)
        print(f"Changed directory to: {project_root}")

    setup_python_path(project_root)

    from lib.coordinator import BookmarkCoordinator

    coordinator = BookmarkCoordinator(
        bookmarks_path=args.bookmarks,
        output_dir=args.output,
        skip_cache=args.full,
    )

    if args.id:
        from lib.coordinator import DEFAULT_BOOKMARKS_PATH
        import json

        bookmarks = coordinator.load_bookmarks()
        bookmark = None
        for bm in bookmarks:
            if str(bm.get("id")) == str(args.id):
                bookmark = bm
                break

        if bookmark is None:
            print(f"Error: Bookmark with ID '{args.id}' not found")
            sys.exit(1)

        print(f"Processing single bookmark: {args.id}")
        result = coordinator.process_bookmark(bookmark)

        report = coordinator.build_report([result], format=args.format)
        report_path = coordinator.save_report(report, format=args.format)
        print(f"\nReport saved to: {report_path}")
    else:
        result = coordinator.run(limit=args.limit, full=args.full)

        if "error" in result:
            print(f"Error: {result['error']}")
            sys.exit(1)

        report = coordinator.build_report(result["bookmarks"], format=args.format)
        report_path = coordinator.save_report(report, format=args.format)
        data_path = coordinator.save_processed_data(result["bookmarks"])

        stats = result["stats"]
        print("\n" + "=" * 50)
        print("PROCESSING COMPLETE")
        print("=" * 50)
        print(f"Total processed: {stats['total']}")
        print(f"  - Articles: {stats['articles']}")
        print(f"  - Quoted tweets: {stats['quoted']}")
        print(f"  - GitHub links: {stats['github']}")
        print(f"  - External links: {stats['external']}")
        print(f"  - Errors: {stats['errors']}")
        print(f"\nReport: {report_path}")
        print(f"Data: {data_path}")
        print(f"Time: {result['elapsed_seconds']:.1f}s")


if __name__ == "__main__":
    main()
