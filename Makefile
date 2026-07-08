.PHONY: deploy destroy clean

deploy:
	chmod +x deploy.sh
	./deploy.sh

destroy:
	chmod +x destroy.sh
	./destroy.sh

clean:
	rm -rf dist
	rm -rf terraform/.terraform
	rm -f terraform/.terraform.lock.hcl
	rm -f terraform/terraform.tfstate*
