#!/bin/bash

# Create output directory if it doesn't exist
mkdir -p pdf_output

# Convert each markdown file to PDF
for file in *.md; do
    if [ -f "$file" ]; then
        echo "Converting $file to PDF..."
        # Get filename without extension
        filename=$(basename "$file" .md)
        # Convert to PDF using pandoc with XeLaTeX
        pandoc "$file" \
            --lua-filter ./filter.lua \
            -o "pdf_output/${filename}.pdf" \
            --pdf-engine=xelatex \
            -V geometry:margin=1in \
            -V papersize:letter \
            -V mainfont="Libertinus Serif" \
            -V monofont="Libertinus Mono" \
            --variable=documentclass:article \
            --variable=parskip:12pt
    fi
done

echo "Conversion complete! PDFs are in the pdf_output directory." 
